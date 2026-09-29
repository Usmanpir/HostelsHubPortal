import { createDecipheriv, randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/lib/errors";
import { decryptJson, decryptString, encryptJson, encryptString } from "@/lib/security/crypto";
import { resetRateLimit } from "@/lib/security/rate-limit";
import type { TenantContext } from "@/lib/tenant/context";
import type { ResidentContext } from "@/lib/tenant/resident";
import { createInvoice } from "@/services/finance/invoice-service";
import { recordPayment } from "@/services/finance/payment-service";
import {
  buildJazzcashFields,
  formatJazzcashDateTime,
  jazzcashHashMessage,
  jazzcashInquiryResult,
  jazzcashSecureHash,
  toPaisa,
  verifyJazzcashHash,
} from "@/services/payments/jazzcash";
import {
  easypaisaEncrypt,
  easypaisaHashString,
  easypaisaInquiryResult,
  easypaisaMobile,
  easypaisaOrderFromIpnUrl,
  formatEasypaisaAmount,
  formatEasypaisaExpiry,
} from "@/services/payments/easypaisa";
import { simulatorCallbackFields, simulatorEnabled } from "@/services/payments/simulator";
import { GatewayVerificationError } from "@/services/payments/types";
import { getGatewaySettings, saveGatewayConfig } from "@/services/payments/gateway-config-service";
import {
  completeOnlinePayment,
  handleGatewayIpn,
  handleGatewayReturn,
  listAvailableGateways,
  reconcileOnlinePayments,
  startOnlinePayment,
} from "@/services/payments/online-payment-service";
import { createHostelWithRoom, createResidentRow, createTenant, createUser, prisma } from "./helpers";

// ─── Pure functions ─────────────────────────────────────────────────────────

describe("JazzCash signing", () => {
  it("matches the official HMAC-SHA256 example from the sandbox documentation", () => {
    // https://sandbox.jazzcash.com.pk/SandboxDocumentation/features.html (hashing section)
    const fields = { pp_Amount: "2995", pp_MerchantID: "MER123", pp_OrderInfo: "A48cvE28" };
    expect(jazzcashHashMessage(fields, "0F5DD14AE2")).toBe("0F5DD14AE2&2995&MER123&A48cvE28");
    expect(jazzcashSecureHash(fields, "0F5DD14AE2")).toBe("C7689CDA7474EB1ADCD343FD0C0B676BAD0BA66361CC46DB589BDB0DA4C1C867");
  });

  it("sorts by field name, skips empty values, non-pp fields and pp_SecureHash itself", () => {
    const msg = jazzcashHashMessage(
      { pp_TxnRefNo: "T1", pp_Amount: "100", pp_BankID: "", ppmpf_1: "x", pp_SecureHash: "ABC", other: "ignored" },
      "salt",
    );
    expect(msg).toBe("salt&100&T1&x");
  });

  it("verifies hashes case-insensitively and rejects tampering", () => {
    const fields: Record<string, string> = { pp_Amount: "150000", pp_TxnRefNo: "OPABC", pp_ResponseCode: "000" };
    fields.pp_SecureHash = jazzcashSecureHash(fields, "s3cret").toLowerCase();
    expect(verifyJazzcashHash(fields, "s3cret")).toBe(true);
    expect(verifyJazzcashHash({ ...fields, pp_Amount: "100" }, "s3cret")).toBe(false);
    expect(verifyJazzcashHash({ ...fields, pp_SecureHash: "" }, "s3cret")).toBe(false);
  });

  it("formats amounts in paisa and timestamps in Pakistan time", () => {
    expect(toPaisa(1234.5)).toBe("123450");
    expect(toPaisa(0.1 + 0.2)).toBe("30");
    expect(formatJazzcashDateTime(new Date("2026-09-29T19:30:05Z"))).toBe("20260930003005");
  });

  it("builds a signed checkout form", () => {
    const fields = buildJazzcashFields(
      { environment: "SANDBOX", merchantId: "MC123", subMerchantId: null, secrets: { password: "pw", integritySalt: "salt" } },
      {
        txnRef: "OPTEST1",
        amount: 10000,
        currency: "PKR",
        billReference: "INV-00042",
        description: "Invoice INV-00042 <rent>",
        createdAt: new Date("2026-09-01T00:00:00Z"),
        expiresAt: new Date("2026-09-01T01:00:00Z"),
        returnUrl: "https://app.example.com/api/payments/online/jazzcash/return",
        customer: {},
      },
    );
    expect(fields.pp_Amount).toBe("1000000");
    expect(fields.pp_BillReference).toBe("INV00042");
    expect(fields.pp_Description).not.toMatch(/[<>]/);
    expect(fields.pp_TxnDateTime).toBe("20260901050000");
    expect(verifyJazzcashHash(fields, "salt")).toBe(true);
  });

  it("separates the inquiry status from the payment status", () => {
    expect(jazzcashInquiryResult("T", { pp_ResponseCode: "000", pp_PaymentResponseCode: "000", pp_Amount: "5000" }, "s").outcome).toBe("SUCCEEDED");
    expect(jazzcashInquiryResult("T", { pp_ResponseCode: "000", pp_PaymentResponseCode: "157" }, "s").outcome).toBe("PENDING");
    // "000" alone only means the inquiry was accepted.
    expect(jazzcashInquiryResult("T", { pp_ResponseCode: "000" }, "s").outcome).toBe("PENDING");
    expect(jazzcashInquiryResult("T", { pp_ResponseCode: "000", pp_PaymentResponseCode: "199" }, "s").outcome).toBe("FAILED");
  });
});

describe("Easypaisa helpers", () => {
  it("builds the sorted key=value string and AES/ECB encrypts it with the hash key", () => {
    const plain = easypaisaHashString({
      storeId: "43",
      amount: "10.0",
      postBackURL: "https://x.test/r",
      orderRefNum: "OP1",
      expiryDate: "20260901 050000",
      autoRedirect: "1",
      paymentMethod: "",
    });
    expect(plain).toBe("amount=10.0&autoRedirect=1&expiryDate=20260901 050000&orderRefNum=OP1&postBackURL=https://x.test/r&storeId=43");
    const key = "ABCDEFGHIJKLMNOP";
    const encrypted = easypaisaEncrypt(plain, key);
    const decipher = createDecipheriv("aes-128-ecb", Buffer.from(key), null);
    expect(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8")).toBe(plain);
    expect(() => easypaisaEncrypt(plain, "short")).toThrow(GatewayVerificationError);
  });

  it("formats amounts, expiry and mobile numbers", () => {
    expect(formatEasypaisaAmount(10)).toBe("10.0");
    expect(formatEasypaisaAmount(1250.5)).toBe("1250.5");
    expect(formatEasypaisaAmount(10.25)).toBe("10.25");
    expect(formatEasypaisaExpiry(new Date("2026-09-01T00:00:00Z"))).toBe("20260901 050000");
    expect(easypaisaMobile("+92 300 1234567")).toBe("03001234567");
    expect(easypaisaMobile("03001234567")).toBe("03001234567");
    expect(easypaisaMobile("12345")).toBe("");
  });

  it("only accepts IPN URLs on Easypaisa hosts", () => {
    expect(easypaisaOrderFromIpnUrl("https://easypay.easypaisa.com.pk/easypay-service/rest/v1/order-status/123/OPABC")).toBe("OPABC");
    expect(easypaisaOrderFromIpnUrl("https://evil.example.com/easypay-service/rest/v1/order-status/123/OPABC")).toBeNull();
    expect(easypaisaOrderFromIpnUrl("http://easypay.easypaisa.com.pk/easypay-service/rest/v1/order-status/123/OPABC")).toBeNull();
  });

  it("maps inquiry statuses and surfaces configuration errors", () => {
    expect(easypaisaInquiryResult("OP1", { responseCode: "0000", transactionStatus: "PAID", transactionAmount: "10.0" }).outcome).toBe("SUCCEEDED");
    expect(easypaisaInquiryResult("OP1", { responseCode: "0000", transactionStatus: "FAILED" }).outcome).toBe("FAILED");
    expect(easypaisaInquiryResult("OP1", { responseCode: "0003" }).outcome).toBe("PENDING");
    expect(() => easypaisaInquiryResult("OP1", { responseCode: "0010" })).toThrow(GatewayVerificationError);
  });
});

describe("secret encryption", () => {
  it("round-trips and detects tampering", () => {
    const key = randomBytes(32);
    const token = encryptString("integrity-salt-value", key);
    expect(token).not.toContain("integrity-salt-value");
    expect(decryptString(token, key)).toBe("integrity-salt-value");
    expect(encryptString("same", key)).not.toBe(encryptString("same", key));
    const [v, iv, tag, data] = token.split(".");
    const flipped = Buffer.from(data!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptString([v, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
    expect(() => decryptString(token, randomBytes(32))).toThrow();
  });

  it("encrypts JSON with the environment-derived key", () => {
    const secrets = { password: "p@ss", integritySalt: "salt" };
    expect(decryptJson(encryptJson(secrets))).toEqual(secrets);
  });
});

// ─── Integration ────────────────────────────────────────────────────────────

describe("online payments", () => {
  let ctx: TenantContext;
  let hostelId: string;
  let resident: ResidentContext;
  let otherResident: ResidentContext;
  let foreignInvoiceId: string;
  let foreignOrgId: string;

  async function residentContext(tenant: TenantContext, hostel: string, name: string): Promise<ResidentContext> {
    const user = await createUser(name);
    const row = await createResidentRow(tenant, hostel, name);
    await prisma.resident.update({ where: { id: row.id }, data: { userId: user.id } });
    await resetRateLimit(`online-pay:${user.id}`);
    return {
      userId: user.id,
      residentId: row.id,
      organizationId: tenant.organizationId,
      hostelId: hostel,
      name,
      organization: { id: tenant.organizationId, name: tenant.organization.name, currency: "PKR", timezone: "Asia/Karachi", locale: "en", brandName: null, logoFileId: null },
    };
  }

  const invoiceFor = (who: ResidentContext, amount = 10000) =>
    createInvoice(ctx, {
      residentId: who.residentId,
      issueDate: "2026-09-01",
      dueDate: "2099-09-10",
      items: [{ type: "MONTHLY_RENT", description: "Rent", quantity: 1, unitPrice: amount }],
      applyTax: false,
    });

  const paymentsFor = (invoiceId: string) => prisma.payment.findMany({ where: { invoiceId, status: "COMPLETED" } });

  beforeAll(async () => {
    process.env.PAYMENTS_SIMULATOR = "true";
    const t = await createTenant("Online Pay Org");
    const s = await createHostelWithRoom(t.ctx);
    ctx = s.ctx;
    hostelId = s.hostel.id;
    resident = await residentContext(ctx, hostelId, "Sana");
    otherResident = await residentContext(ctx, hostelId, "Bilal");

    const foreign = await createTenant("Other Online Org");
    const fs = await createHostelWithRoom(foreign.ctx);
    const foreignResident = await createResidentRow(fs.ctx, fs.hostel.id, "Zara");
    const inv = await createInvoice(fs.ctx, {
      residentId: foreignResident.id,
      issueDate: "2026-09-01",
      dueDate: "2099-09-10",
      items: [{ type: "MONTHLY_RENT", description: "Rent", quantity: 1, unitPrice: 5000 }],
      applyTax: false,
    });
    foreignInvoiceId = inv.id;
    foreignOrgId = foreign.org.id;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetRateLimit(`online-pay:${resident.userId}`);
  });

  it("is enabled for tests via PAYMENTS_SIMULATOR and never in production", () => {
    expect(simulatorEnabled()).toBe(true);
    expect(simulatorEnabled({ NODE_ENV: "production", PAYMENTS_SIMULATOR: "true" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("does not let a resident pay another resident's or another tenant's invoice", async () => {
    const theirs = await invoiceFor(otherResident);
    await expect(startOnlinePayment(resident, { invoiceId: theirs.id, provider: "SIMULATOR" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(startOnlinePayment(resident, { invoiceId: foreignInvoiceId, provider: "SIMULATOR" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.onlinePayment.count({ where: { invoiceId: { in: [theirs.id, foreignInvoiceId] } } })).toBe(0);
  });

  it("charges exactly the remaining balance", async () => {
    const invoice = await invoiceFor(resident, 11000);
    await recordPayment(ctx, { residentId: resident.residentId, invoiceId: invoice.id, amount: 1000, method: "CASH", paymentDate: "2026-09-02" });
    const { onlinePaymentId } = await startOnlinePayment(resident, { invoiceId: invoice.id, provider: "SIMULATOR" });
    const row = await prisma.onlinePayment.findUniqueOrThrow({ where: { id: onlinePaymentId } });
    expect(Number(row.amount)).toBe(10000);
    expect(row.status).toBe("PENDING");
    expect(row.residentId).toBe(resident.residentId);
    expect(row.organizationId).toBe(ctx.organizationId);
  });

  it("records exactly one Payment even when the success callback is replayed or races", async () => {
    const invoice = await invoiceFor(resident, 8000);
    const { txnRef } = await startOnlinePayment(resident, { invoiceId: invoice.id, provider: "SIMULATOR" });
    const approve = simulatorCallbackFields(txnRef, "approve", 8000);

    const results = await Promise.all([
      completeOnlinePayment("SIMULATOR", approve),
      completeOnlinePayment("SIMULATOR", approve),
    ]);
    const again = await completeOnlinePayment("SIMULATOR", approve);

    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(again.changed).toBe(false);
    const payments = await paymentsFor(invoice.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.method).toBe("ONLINE");
    expect(payments[0]!.receivedById).toBeNull();
    expect(Number(payments[0]!.amount)).toBe(8000);
    const refreshed = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(refreshed.status).toBe("PAID");
    const row = await prisma.onlinePayment.findUniqueOrThrow({ where: { txnRef } });
    expect(row.status).toBe("SUCCEEDED");
    expect(row.paymentId).toBe(payments[0]!.id);
    expect(await prisma.auditLog.count({ where: { entityId: row.id, action: "payment.online_succeeded" } })).toBe(1);
  });

  it("ignores callbacks with an invalid signature and doesn't pay on a decline", async () => {
    const invoice = await invoiceFor(resident, 5000);
    const { txnRef } = await startOnlinePayment(resident, { invoiceId: invoice.id, provider: "SIMULATOR" });
    const forged = { ...simulatorCallbackFields(txnRef, "approve", 5000), signature: "00".repeat(32) };
    await expect(completeOnlinePayment("SIMULATOR", forged)).rejects.toBeInstanceOf(GatewayVerificationError);
    // Tampering with the amount breaks the signature too.
    const cheap = { ...simulatorCallbackFields(txnRef, "approve", 5000), amount: "1.00" };
    await expect(completeOnlinePayment("SIMULATOR", cheap)).rejects.toBeInstanceOf(GatewayVerificationError);
    expect((await prisma.onlinePayment.findUniqueOrThrow({ where: { txnRef } })).status).toBe("PENDING");

    const declined = await completeOnlinePayment("SIMULATOR", simulatorCallbackFields(txnRef, "decline", 5000));
    expect(declined.status).toBe("FAILED");
    expect(await paymentsFor(invoice.id)).toHaveLength(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PENDING");

    // A browser return for a forged payload lands on the error banner.
    const handled = await handleGatewayReturn("SIMULATOR", forged, {});
    expect(handled).toEqual({ kind: "redirect", path: `/portal/invoices/${invoice.id}?payment=error` });
  });

  describe("JazzCash", () => {
    const salt = "TESTSALT12";

    beforeAll(async () => {
      await saveGatewayConfig(ctx, {
        provider: "JAZZCASH",
        enabled: true,
        environment: "SANDBOX",
        merchantId: "MC12345",
        subMerchantId: "",
        secrets: { password: "pw123", integritySalt: salt },
      });
    });

    it("keeps secrets write-only and scoped to the organization", async () => {
      const view = await getGatewaySettings(ctx);
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain(salt);
      expect(serialized).not.toContain("pw123");
      const jc = view.gateways.find((g) => g.provider === "JAZZCASH")!;
      expect(jc.secretFields.every((f) => f.saved)).toBe(true);
      const stored = await prisma.paymentGatewayConfig.findFirstOrThrow({ where: { organizationId: ctx.organizationId, provider: "JAZZCASH" } });
      expect(stored.secretsEncrypted).not.toContain(salt);

      // Saving without re-entering secrets keeps them.
      await saveGatewayConfig(ctx, { provider: "JAZZCASH", enabled: true, environment: "SANDBOX", merchantId: "MC12345", subMerchantId: "", secrets: { password: "", integritySalt: "" } });
      expect(decryptJson((await prisma.paymentGatewayConfig.findFirstOrThrow({ where: { id: stored.id } })).secretsEncrypted!)).toEqual({ password: "pw123", integritySalt: salt });

      expect((await listAvailableGateways(ctx.organizationId)).map((g) => g.provider)).toContain("JAZZCASH");
      // Another tenant never sees this organization's gateway.
      expect((await listAvailableGateways(foreignOrgId)).map((g) => g.provider)).not.toContain("JAZZCASH");
    });

    const signedReturn = (fields: Record<string, string>, overrides: Record<string, string>) => {
      const payload: Record<string, string> = { ...fields, pp_ResponseCode: "000", pp_ResponseMessage: "Thank you", pp_RetreivalReferenceNo: "260901123456", ...overrides };
      delete payload.pp_Password;
      delete payload.pp_SecureHash;
      payload.pp_SecureHash = jazzcashSecureHash(payload, salt);
      return payload;
    };

    it("completes a signed return and rejects forged or altered ones", async () => {
      const invoice = await invoiceFor(resident, 12000);
      const { txnRef, form } = await startOnlinePayment(resident, { invoiceId: invoice.id, provider: "JAZZCASH" });
      expect(form.method).toBe("POST");
      expect(form.actionUrl).toContain("sandbox.jazzcash.com.pk");
      expect(form.fields.pp_Amount).toBe("1200000");
      expect(verifyJazzcashHash(form.fields, salt)).toBe(true);

      // Forged: valid-looking fields signed with the wrong salt.
      const forged = { ...signedReturn(form.fields, {}), pp_SecureHash: jazzcashSecureHash({ ...form.fields, pp_ResponseCode: "000" }, "WRONGSALT") };
      await expect(completeOnlinePayment("JAZZCASH", forged)).rejects.toBeInstanceOf(GatewayVerificationError);
      // Altered status after signing.
      const altered = { ...signedReturn(form.fields, { pp_ResponseCode: "199" }), pp_ResponseCode: "000" };
      await expect(completeOnlinePayment("JAZZCASH", altered)).rejects.toBeInstanceOf(GatewayVerificationError);
      expect(await paymentsFor(invoice.id)).toHaveLength(0);

      const ok = await handleGatewayReturn("JAZZCASH", signedReturn(form.fields, {}), {});
      expect(ok).toEqual({ kind: "redirect", path: `/portal/invoices/${invoice.id}?payment=success` });
      const payments = await paymentsFor(invoice.id);
      expect(payments).toHaveLength(1);
      expect(payments[0]!.reference).toBe("260901123456");
      expect(payments[0]!.notes).toContain("JazzCash");
      expect((await prisma.onlinePayment.findUniqueOrThrow({ where: { txnRef } })).status).toBe("SUCCEEDED");

      // Replay of the same signed POST: still one payment.
      await handleGatewayReturn("JAZZCASH", signedReturn(form.fields, {}), {});
      expect(await paymentsFor(invoice.id)).toHaveLength(1);
    });

    it("refuses a signed success whose amount differs from what was charged", async () => {
      const invoice = await invoiceFor(resident, 9000);
      const { txnRef, form } = await startOnlinePayment(resident, { invoiceId: invoice.id, provider: "JAZZCASH" });
      const result = await completeOnlinePayment("JAZZCASH", signedReturn(form.fields, { pp_Amount: "100" }));
      expect(result.status).toBe("FAILED");
      expect(await paymentsFor(invoice.id)).toHaveLength(0);
      expect(await prisma.auditLog.count({ where: { action: "payment.online_amount_mismatch", metadata: { path: ["txnRef"], equals: txnRef } } })).toBe(1);
    });

    it("reconciles a stale pending payment through the status inquiry", async () => {
      const invoice = await invoiceFor(resident, 7000);
      const { txnRef } = await startOnlinePayment(resident, { invoiceId: invoice.id, provider: "JAZZCASH" });
      await prisma.onlinePayment.update({ where: { txnRef }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, string>;
        expect(verifyJazzcashHash(body, salt)).toBe(true);
        const response =
          body.pp_TxnRefNo === txnRef
            ? { pp_ResponseCode: "000", pp_PaymentResponseCode: "000", pp_PaymentResponseMessage: "Completed", pp_Amount: "700000", pp_RetreivalReferenceNo: "RRN777" }
            : { pp_ResponseCode: "000", pp_PaymentResponseCode: "157" };
        return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
      });
      vi.stubGlobal("fetch", fetchMock);
      const summary = await reconcileOnlinePayments();
      expect(summary.succeeded).toBeGreaterThanOrEqual(1);
      const payments = await paymentsFor(invoice.id);
      expect(payments).toHaveLength(1);
      expect(payments[0]!.reference).toBe("RRN777");
    });
  });

  describe("Easypaisa", () => {
    beforeAll(async () => {
      await saveGatewayConfig(ctx, {
        provider: "EASYPAISA",
        enabled: true,
        environment: "SANDBOX",
        merchantId: "4321",
        subMerchantId: "03001234567",
        secrets: { hashKey: "ABCDEFGHIJKLMNOP", apiUsername: "api", apiPassword: "secret" },
      });
    });

    const inquiryReturning = (status: string, amount: string) =>
      vi.fn(async () => new Response(JSON.stringify({ responseCode: "0000", transactionStatus: status, transactionAmount: amount, transactionId: "EP-1" }), { status: 200 }));

    it("continues the auth_token step and trusts only the server-side inquiry", async () => {
      const invoice = await invoiceFor(resident, 6000);
      const { txnRef, form } = await startOnlinePayment(resident, { invoiceId: invoice.id, provider: "EASYPAISA" });
      expect(form.actionUrl).toContain("easypaystg.easypaisa.com.pk/easypay/Index.jsf");
      expect(form.fields.amount).toBe("6000.0");
      expect(form.fields.merchantHashedReq).toBeTruthy();

      const step = await handleGatewayReturn("EASYPAISA", { auth_token: "tok123" }, { checkoutRef: txnRef });
      expect(step.kind).toBe("form");
      if (step.kind === "form") {
        expect(step.form.actionUrl).toContain("easypaystg.easypaisa.com.pk/easypay/Confirm.jsf");
        expect(step.form.fields.auth_token).toBe("tok123");
      }

      // Browser claims success, Easypaisa says FAILED → not paid.
      vi.stubGlobal("fetch", inquiryReturning("FAILED", "6000.0"));
      const failed = await handleGatewayReturn("EASYPAISA", { status: "Success", desc: "0000", orderRefNumber: txnRef }, {});
      expect(failed).toEqual({ kind: "redirect", path: `/portal/invoices/${invoice.id}?payment=failed` });
      expect(await paymentsFor(invoice.id)).toHaveLength(0);

      // IPN later: Easypaisa now reports PAID → recorded once.
      vi.stubGlobal("fetch", inquiryReturning("PAID", "6000.0"));
      await handleGatewayIpn("EASYPAISA", { url: `https://easypaystg.easypaisa.com.pk/easypay-service/rest/v1/order-status/4321/${txnRef}` });
      await handleGatewayIpn("EASYPAISA", { url: `https://easypaystg.easypaisa.com.pk/easypay-service/rest/v1/order-status/4321/${txnRef}` });
      expect(await paymentsFor(invoice.id)).toHaveLength(1);
      await expect(handleGatewayIpn("EASYPAISA", { url: `https://attacker.example/order-status/4321/${txnRef}` })).rejects.toBeInstanceOf(GatewayVerificationError);
    });
  });
});
