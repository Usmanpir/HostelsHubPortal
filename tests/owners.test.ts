import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { PaymentType } from "@/generated/prisma/enums";
import type { TenantContext } from "@/lib/tenant/context";
import {
  archiveOwner,
  createOwner,
  getOwner,
  listOwners,
  setOwnerProperties,
  updateOwner,
} from "@/services/owners/owner-service";
import { cancelPayout, createPayout, listPayouts, markPayoutPaid } from "@/services/owners/payout-service";
import { computeStatementLines, getOwnerStatement } from "@/services/owners/statement";
import { detectPreset, lastMonth, periodLabel, thisMonth } from "@/services/owners/period";
import { addMember, createHostelWithRoom, createResidentRow, createTenant, prisma, reload } from "./helpers";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uid = () => randomUUID().slice(0, 8);

async function enableOwners(ctx: TenantContext) {
  await prisma.organization.update({ where: { id: ctx.organizationId }, data: { ownersEnabled: true } });
  return reload(ctx);
}

async function pay(ctx: TenantContext, hostelId: string, residentId: string, type: PaymentType, amount: number, date: string, status: "COMPLETED" | "VOIDED" = "COMPLETED") {
  await prisma.payment.create({
    data: {
      organizationId: ctx.organizationId,
      hostelId,
      residentId,
      receiptNumber: `T-${uid()}`,
      type,
      status,
      amount,
      method: "CASH",
      paymentDate: day(date),
    },
  });
}

async function spend(ctx: TenantContext, hostelId: string, categoryId: string, amount: number, date: string, status: "RECORDED" | "VOIDED" = "RECORDED") {
  await prisma.expense.create({
    data: { organizationId: ctx.organizationId, hostelId, categoryId, amount, date: day(date), status },
  });
}

describe("owner statement math (pure)", () => {
  const props = [
    { id: "a", name: "A", code: "A", archivedAt: null, managementFeePercent: null },
    { id: "b", name: "B", code: "B", archivedAt: null, managementFeePercent: 5 },
    { id: "c", name: "C", code: "C", archivedAt: null, managementFeePercent: 0 },
  ];

  it("applies the property override, falls back to the owner default, and nets expenses", () => {
    const cash = new Map([
      ["a", { payments: 10000, advances: 1500, refunds: 1000 }],
      ["b", { payments: 20000, advances: 0, refunds: 0 }],
      ["c", { payments: 3000, advances: 0, refunds: 0 }],
    ]);
    const expenses = new Map([
      ["a", 1500],
      ["b", 2000],
    ]);
    const { lines, totals } = computeStatementLines(props, 10, cash, expenses);
    expect(lines[0]).toMatchObject({ collected: 10500, expenses: 1500, feePercent: 10, feeSource: "OWNER", fee: 1050, net: 7950 });
    expect(lines[1]).toMatchObject({ collected: 20000, expenses: 2000, feePercent: 5, feeSource: "PROPERTY", fee: 1000, net: 17000 });
    // An explicit 0% property rate overrides the owner default.
    expect(lines[2]).toMatchObject({ feePercent: 0, feeSource: "PROPERTY", fee: 0, net: 3000 });
    expect(totals).toMatchObject({ collected: 33500, expenses: 3500, fee: 2050, net: 27950 });
  });

  it("charges no fee when refunds exceed collections and rounds to cents", () => {
    const { lines } = computeStatementLines(
      [props[0]!],
      12.5,
      new Map([["a", { payments: 100, advances: 0, refunds: 300 }]]),
      new Map(),
    );
    expect(lines[0]).toMatchObject({ collected: -200, fee: 0, net: -200 });
    const r = computeStatementLines([props[0]!], 7.77, new Map([["a", { payments: 333.33, advances: 0, refunds: 0 }]]), new Map());
    expect(r.lines[0]!.fee).toBe(25.9);
  });

  it("resolves period presets", () => {
    expect(thisMonth("2026-03-17")).toEqual({ from: "2026-03-01", to: "2026-03-17" });
    expect(lastMonth("2026-03-17")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(lastMonth("2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(detectPreset({ from: "2026-02-01", to: "2026-02-28" }, "2026-03-17")).toBe("last_month");
    expect(detectPreset({ from: "2026-02-02", to: "2026-02-28" }, "2026-03-17")).toBe("custom");
    expect(periodLabel({ from: "2026-08-01", to: "2026-08-31" })).toBe("August 2026");
  });
});

describe("owners module", () => {
  let ctx: TenantContext;
  let ownerId: string;
  let hostelA: string;
  let hostelB: string;
  let categoryId: string;

  beforeAll(async () => {
    const t = await createTenant("Owners Org");
    ctx = await enableOwners(t.ctx);
    const a = await createHostelWithRoom(ctx, 2);
    const b = await createHostelWithRoom(a.ctx, 1);
    ctx = b.ctx;
    hostelA = a.hostel.id;
    hostelB = b.hostel.id;
    await prisma.hostel.update({ where: { id: hostelB }, data: { managementFeePercent: 5 } });

    const owner = await createOwner(ctx, { name: "Tariq Mehmood", phone: "+923001112233", commissionPercent: 10 });
    ownerId = owner.id;
    await setOwnerProperties(ctx, ownerId, { hostelIds: [hostelA, hostelB] });

    const resA = await createResidentRow(ctx, hostelA);
    const resB = await createResidentRow(ctx, hostelB, "Sara");
    categoryId = (await prisma.expenseCategory.create({ data: { organizationId: ctx.organizationId, key: `k${uid()}`, name: "Repairs" } })).id;

    // Hostel A, August: 10000 + 2000 advance, credit applied (−500 advance / +500 payment), 1000 refunded.
    await pay(ctx, hostelA, resA.id, "PAYMENT", 10000, "2026-08-05");
    await pay(ctx, hostelA, resA.id, "ADVANCE", 2000, "2026-08-10");
    await pay(ctx, hostelA, resA.id, "ADVANCE", -500, "2026-08-12");
    await pay(ctx, hostelA, resA.id, "PAYMENT", 500, "2026-08-12");
    await pay(ctx, hostelA, resA.id, "REFUND", 1000, "2026-08-20");
    await pay(ctx, hostelA, resA.id, "PAYMENT", 9999, "2026-08-21", "VOIDED");
    await pay(ctx, hostelA, resA.id, "PAYMENT", 7777, "2026-09-01");
    await spend(ctx, hostelA, categoryId, 1500, "2026-08-15");
    await spend(ctx, hostelA, categoryId, 800, "2026-08-16", "VOIDED");
    await spend(ctx, hostelA, categoryId, 300, "2026-07-31");
    // Hostel B, August.
    await pay(ctx, hostelB, resB.id, "PAYMENT", 20000, "2026-08-31");
    await spend(ctx, hostelB, categoryId, 2000, "2026-08-01");
  });

  it("assigns sequential owner codes", async () => {
    const other = await createOwner(ctx, { name: "Second Owner" });
    expect(other.ownerCode).toMatch(/^OWN-\d{4}$/);
    const first = await prisma.propertyOwner.findUniqueOrThrow({ where: { id: ownerId } });
    expect(first.ownerCode).toMatch(/^OWN-\d{4}$/);
    expect(other.ownerCode).not.toBe(first.ownerCode);
  });

  it("builds the statement from completed cash and recorded expenses in the period", async () => {
    const s = await getOwnerStatement(ctx, ownerId, { from: "2026-08-01", to: "2026-08-31" });
    const a = s.lines.find((l) => l.hostelId === hostelA)!;
    const b = s.lines.find((l) => l.hostelId === hostelB)!;
    expect(a).toMatchObject({ collected: 11000, expenses: 1500, feePercent: 10, fee: 1100, net: 8400 });
    expect(b).toMatchObject({ collected: 20000, expenses: 2000, feePercent: 5, feeSource: "PROPERTY", fee: 1000, net: 17000 });
    expect(s.totals).toMatchObject({ collected: 31000, expenses: 3500, fee: 2100, net: 25400 });
    expect(s.payments).toHaveLength(6);
    expect(s.payments.find((p) => p.type === "REFUND")!.amount).toBe(-1000);
    expect(s.expenses).toHaveLength(2);
  });

  it("rejects an inverted or oversized period", async () => {
    await expect(getOwnerStatement(ctx, ownerId, { from: "2026-08-31", to: "2026-08-01" })).rejects.toBeInstanceOf(ValidationError);
    await expect(getOwnerStatement(ctx, ownerId, { from: "2024-01-01", to: "2026-01-01" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("shows owner detail with linked properties", async () => {
    const o = await getOwner(ctx, ownerId);
    expect(o.properties.map((p) => p.id).sort()).toEqual([hostelA, hostelB].sort());
    expect(o.stats.propertyCount).toBe(2);
    expect(o.stats.occupancy.totalBeds).toBe(3);
    const list = await listOwners(ctx, { q: "Tariq" });
    expect(list.items[0]).toMatchObject({ id: ownerId, propertyCount: 2, commissionPercent: 10 });
  });

  it("hides owners whose portfolio is outside a restricted member's access", async () => {
    const restricted: TenantContext = { ...ctx, allHostels: false, accessibleHostelIds: [hostelA] };
    await expect(getOwner(restricted, ownerId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOwnerStatement(restricted, ownerId, { from: "2026-08-01", to: "2026-08-31" })).rejects.toBeInstanceOf(NotFoundError);
    const list = await listOwners(restricted, { q: "Tariq" });
    expect(list.items).toHaveLength(0);
  });

  it("snapshots a payout and refuses overlapping pending/paid payouts", async () => {
    const payout = await createPayout(ctx, { ownerId, from: "2026-08-01", to: "2026-08-31", adjustments: -400, notes: "Plumber advance" });
    expect(payout).toMatchObject({ status: "PENDING", rentCollected: 31000, expenses: 3500, commission: 2100, adjustments: -400, netPayable: 25000 });
    expect(await prisma.auditLog.count({ where: { entityId: payout.id, action: "owner_payout.created" } })).toBe(1);

    await expect(createPayout(ctx, { ownerId, from: "2026-08-15", to: "2026-09-10" })).rejects.toBeInstanceOf(ConflictError);

    await cancelPayout(ctx, payout.id, { reason: "Wrong adjustment" });
    await expect(cancelPayout(ctx, payout.id)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(await prisma.auditLog.count({ where: { entityId: payout.id, action: "owner_payout.cancelled" } })).toBe(1);

    const again = await createPayout(ctx, { ownerId, from: "2026-08-01", to: "2026-08-31" });
    expect(again.netPayable).toBe(25400);
    const paid = await markPayoutPaid(ctx, again.id, { paidAt: "2026-09-02", paymentMethod: "BANK_TRANSFER", reference: "TRX-1" });
    expect(paid).toMatchObject({ status: "PAID", paidAt: "2026-09-02", paymentMethod: "BANK_TRANSFER", reference: "TRX-1" });
    await expect(markPayoutPaid(ctx, again.id, { paidAt: "2026-09-02", paymentMethod: "CASH" })).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(createPayout(ctx, { ownerId, from: "2026-08-31", to: "2026-09-05" })).rejects.toBeInstanceOf(ConflictError);

    // Non-overlapping period is fine.
    const july = await createPayout(ctx, { ownerId, from: "2026-07-01", to: "2026-07-31" });
    expect(july).toMatchObject({ rentCollected: 0, expenses: 300, commission: 0, netPayable: -300 });

    const list = await listPayouts(ctx, { ownerId });
    expect(list.total).toBe(3);
    expect(list.totals.PAID.amount).toBe(25400);
  });

  it("requires notes when adjusting a payout", async () => {
    await expect(createPayout(ctx, { ownerId, from: "2026-06-01", to: "2026-06-30", adjustments: 100 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses payouts that end in the future", async () => {
    await expect(createPayout(ctx, { ownerId, from: "2099-01-01", to: "2099-01-31" })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("does not archive an owner with pending payouts or linked properties", async () => {
    await expect(archiveOwner(ctx, ownerId, { unlink: true })).rejects.toBeInstanceOf(BusinessRuleError);
    const pending = await prisma.ownerPayout.findMany({ where: { ownerId, status: "PENDING" } });
    for (const p of pending) await cancelPayout(ctx, p.id);
    await expect(archiveOwner(ctx, ownerId)).rejects.toBeInstanceOf(BusinessRuleError);
    await archiveOwner(ctx, ownerId, { unlink: true });
    expect(await prisma.hostel.count({ where: { ownerId } })).toBe(0);
    await expect(updateOwner(ctx, ownerId, { name: "Changed" })).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe("owners tenant isolation", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;
  let ownerA: string;
  let hostelB: string;

  beforeAll(async () => {
    const a = await createTenant("Owners Iso A");
    const b = await createTenant("Owners Iso B");
    ctxA = (await createHostelWithRoom(await enableOwners(a.ctx), 1)).ctx;
    const hb = await createHostelWithRoom(await enableOwners(b.ctx), 1);
    ctxB = hb.ctx;
    hostelB = hb.hostel.id;
    ownerA = (await createOwner(ctxA, { name: "Owner A" })).id;
  });

  it("cannot link another organization's property", async () => {
    await expect(setOwnerProperties(ctxA, ownerA, { hostelIds: [hostelB] })).rejects.toBeInstanceOf(NotFoundError);
    expect((await prisma.hostel.findUniqueOrThrow({ where: { id: hostelB } })).ownerId).toBeNull();
  });

  it("cannot read or act on another organization's owner", async () => {
    await expect(getOwner(ctxB, ownerA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOwnerStatement(ctxB, ownerA, { from: "2026-08-01", to: "2026-08-31" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateOwner(ctxB, ownerA, { name: "Hijack" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createPayout(ctxB, { ownerId: ownerA, from: "2026-08-01", to: "2026-08-31" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setOwnerProperties(ctxB, ownerA, { hostelIds: [hostelB] })).rejects.toBeInstanceOf(NotFoundError);
    const list = await listOwners(ctxB, { status: "ALL" });
    expect(list.items.some((o) => o.id === ownerA)).toBe(false);
  });
});

describe("owners module switch and permissions", () => {
  it("refuses every operation while the module is disabled", async () => {
    const t = await createTenant("Owners Off");
    expect(t.ctx.organization.ownersEnabled).toBe(false);
    await expect(listOwners(t.ctx)).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(createOwner(t.ctx, { name: "Nope" })).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(listPayouts(t.ctx)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("enforces owners.view and owners.manage", async () => {
    const t = await createTenant("Owners Perms");
    const ctx = await enableOwners(t.ctx);
    const owner = await createOwner(ctx, { name: "Perm Owner" });

    const accountant = await addMember(ctx, "ACCOUNTANT");
    expect((await listOwners(accountant)).items.map((o) => o.id)).toContain(owner.id);
    await expect(createOwner(accountant, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateOwner(accountant, owner.id, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPayout(accountant, { ownerId: owner.id, from: "2026-08-01", to: "2026-08-31" })).rejects.toBeInstanceOf(ForbiddenError);

    const receptionist = await addMember(ctx, "RECEPTIONIST");
    await expect(listOwners(receptionist)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getOwner(receptionist, owner.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
