import { describe, expect, it, beforeAll } from "vitest";
import { BusinessRuleError } from "@/lib/errors";
import { computeInvoiceTotals, deriveInvoiceStatus, getResidentBalance } from "@/services/finance/ledger";
import { cancelInvoice, createInvoice, updateInvoice } from "@/services/finance/invoice-service";
import { applyCreditToInvoice, recordPayment, voidPayment } from "@/services/finance/payment-service";
import type { TenantContext } from "@/lib/tenant/context";
import { createHostelWithRoom, createResidentRow, createTenant, prisma } from "./helpers";

describe("invoices and payments", () => {
  let ctx: TenantContext;
  let residentId: string;

  beforeAll(async () => {
    const t = await createTenant("Finance Org");
    await prisma.organization.update({ where: { id: t.org.id }, data: { taxRate: 10 } });
    const s = await createHostelWithRoom(t.ctx);
    ctx = s.ctx;
    residentId = (await createResidentRow(ctx, s.hostel.id)).id;
  });

  const rentInvoice = (amount = 10000) =>
    createInvoice(ctx, {
      residentId,
      issueDate: "2026-09-01",
      dueDate: "2099-09-10",
      items: [
        { type: "MONTHLY_RENT", description: "September rent", quantity: 1, unitPrice: amount },
        { type: "ELECTRICITY", description: "Electricity", quantity: 1, unitPrice: 1000 },
      ],
      discount: 500,
    });

  it("computes totals with discount and tax", () => {
    expect(computeInvoiceTotals([{ quantity: 2, unitPrice: 100.555 }], 10, 10)).toEqual({
      subtotal: 201.11,
      discount: 10,
      tax: 19.11,
      total: 210.22,
    });
    // Discount is capped at the subtotal.
    expect(computeInvoiceTotals([{ quantity: 1, unitPrice: 50 }], 80, 0).total).toBe(0);
  });

  it("derives invoice status from payments and due date", () => {
    const due = new Date("2026-09-10T00:00:00Z");
    const today = new Date("2026-09-05T00:00:00Z");
    expect(deriveInvoiceStatus({ status: "PENDING", total: 100, amountPaid: 0, dueDate: due, today })).toBe("PENDING");
    expect(deriveInvoiceStatus({ status: "PENDING", total: 100, amountPaid: 40, dueDate: due, today })).toBe("PARTIALLY_PAID");
    expect(deriveInvoiceStatus({ status: "PENDING", total: 100, amountPaid: 100, dueDate: due, today })).toBe("PAID");
    expect(deriveInvoiceStatus({ status: "PENDING", total: 100, amountPaid: 40, dueDate: due, today: new Date("2026-09-11T00:00:00Z") })).toBe("OVERDUE");
    expect(deriveInvoiceStatus({ status: "CANCELLED", total: 100, amountPaid: 0, dueDate: due, today })).toBe("CANCELLED");
  });

  it("creates an invoice with sequential number, org tax and an audit record", async () => {
    const invoice = await rentInvoice();
    expect(invoice.subtotal).toBe(11000);
    expect(invoice.discount).toBe(500);
    expect(invoice.tax).toBe(1050);
    expect(invoice.total).toBe(11550);
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{5}$/);
    const log = await prisma.auditLog.findFirst({ where: { entityId: invoice.id, action: "invoice.created" } });
    expect(log?.userId).toBe(ctx.userId);
  });

  it("rejects a payment above the invoice balance unless recorded as advance", async () => {
    const invoice = await rentInvoice();
    await expect(
      recordPayment(ctx, { residentId, invoiceId: invoice.id, amount: invoice.total + 1, method: "CASH", paymentDate: "2026-09-02" }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const payments = await recordPayment(ctx, {
      residentId,
      invoiceId: invoice.id,
      amount: invoice.total + 450,
      method: "CASH",
      paymentDate: "2026-09-02",
      recordExcessAsAdvance: true,
    });
    expect(payments).toHaveLength(2);
    expect(payments[0]!.type).toBe("PAYMENT");
    expect(payments[1]!).toMatchObject({ type: "ADVANCE", amount: 450 });
    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.status).toBe("PAID");
    const audit = await prisma.auditLog.count({ where: { organizationId: ctx.organizationId, action: "payment.created" } });
    expect(audit).toBeGreaterThanOrEqual(2);
  });

  it("applies advance credit to a later invoice", async () => {
    const before = await getResidentBalance(ctx.organizationId, residentId);
    expect(before.credit).toBe(450);
    const invoice = await rentInvoice(2000);
    await applyCreditToInvoice(ctx, invoice.id);
    const after = await getResidentBalance(ctx.organizationId, residentId);
    expect(after.credit).toBe(0);
    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(updated.amountPaid)).toBe(450);
    expect(updated.status).toBe("PARTIALLY_PAID");
  });

  it("voiding a payment restores the invoice balance; paid invoices can't be cancelled or edited", async () => {
    const invoice = await rentInvoice(3000);
    const [payment] = await recordPayment(ctx, { residentId, invoiceId: invoice.id, amount: 1000, method: "BANK_TRANSFER", paymentDate: "2026-09-03" });
    await expect(cancelInvoice(ctx, invoice.id, "mistake")).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      updateInvoice(ctx, invoice.id, { residentId, issueDate: "2026-09-01", items: [{ type: "OTHER", description: "x", quantity: 1, unitPrice: 1 }] }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    await voidPayment(ctx, payment!.id, "Bounced transfer");
    const restored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(restored.amountPaid)).toBe(0);
    expect(restored.status).toBe("PENDING");
    const voided = await prisma.payment.findUniqueOrThrow({ where: { id: payment!.id } });
    expect(voided.status).toBe("VOIDED");
    const log = await prisma.auditLog.findFirst({ where: { entityId: payment!.id, action: "payment.voided" } });
    expect(log?.metadata).toBeTruthy();

    await cancelInvoice(ctx, invoice.id, "Issued by mistake");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("CANCELLED");
  });

  it("concurrent payments cannot overpay an invoice", async () => {
    const invoice = await rentInvoice(1000);
    const attempts = await Promise.allSettled(
      [1, 2, 3].map(() => recordPayment(ctx, { residentId, invoiceId: invoice.id, amount: invoice.total, method: "CASH", paymentDate: "2026-09-04" })),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const final = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(final.amountPaid)).toBe(invoice.total);
  });
});
