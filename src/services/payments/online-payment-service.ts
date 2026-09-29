import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, type Tx } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { OnlinePaymentStatus, PaymentProvider } from "@/generated/prisma/enums";
import { audit, type AuditActor } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { formatMoney, todayInTimeZone } from "@/lib/format";
import { notifyMembers, notifyResident } from "@/lib/notifications/notify";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions/catalog";
import { enforceRateLimit, type RateLimitRule } from "@/lib/security/rate-limit";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { requirePermission, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import type { ResidentContext } from "@/lib/tenant/resident";
import { idSchema } from "@/lib/validation/common";
import { paymentSchema } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { startOnlinePaymentSchema, type PaymentResultParam, type StartOnlinePaymentInput } from "@/lib/validation/payments";
import { paymentProviderLabels } from "@/config/payment-labels";
import { RECEIVABLE_STATUSES } from "@/services/finance/ledger";
import { recordPaymentTx } from "@/services/finance/payment-service";
import { ownWhere, residentActor } from "@/services/portal/shared";
import { loadGatewayCredentials } from "./gateway-config-service";
import { getAdapter, returnUrlFor } from "./registry";
import { simulatorEnabled } from "./simulator";
import { GatewayVerificationError, type CallbackPayload, type CheckoutForm, type VerifiedResult } from "./types";

/** How long a checkout stays payable at the gateway. */
const CHECKOUT_TTL_MINUTES = 60;
/** Pending attempts older than this are re-checked by the daily reconcile job. */
const RECONCILE_AFTER_MINUTES = 15;
/** Pending attempts are expired this long after their gateway expiry if still unpaid. */
const EXPIRE_GRACE_MINUTES = 60;
const START_RATE_LIMIT: RateLimitRule = { limit: 10, windowSeconds: 10 * 60 };
const CALLBACK_RATE_LIMIT: RateLimitRule = { limit: 30, windowSeconds: 10 * 60 };

const ONLINE_CURRENCY = "PKR";

// ─── Availability ───────────────────────────────────────────────────────────

export type AvailableGateway = { provider: PaymentProvider; label: string; environment: "SANDBOX" | "LIVE" };

/** Gateways the organization has enabled and fully configured (plus the dev simulator). */
export async function listAvailableGateways(organizationId: string): Promise<AvailableGateway[]> {
  const rows = await prisma.paymentGatewayConfig.findMany({
    where: { organizationId, enabled: true, provider: { in: ["JAZZCASH", "EASYPAISA"] } },
    select: { provider: true, environment: true, merchantId: true, subMerchantId: true, secretKeys: true },
    orderBy: { provider: "asc" },
  });
  const available: AvailableGateway[] = rows
    .filter((r) => getAdapter(r.provider).isConfigured({ merchantId: r.merchantId ?? "", subMerchantId: r.subMerchantId, secrets: Object.fromEntries(r.secretKeys.map((k) => [k, "x"])) }))
    .map((r) => ({ provider: r.provider, label: paymentProviderLabels[r.provider], environment: r.environment }));
  if (simulatorEnabled()) available.push({ provider: "SIMULATOR", label: paymentProviderLabels.SIMULATOR, environment: "SANDBOX" });
  return available;
}

// ─── Start (resident portal) ────────────────────────────────────────────────

/** 20 chars max (JazzCash pp_TxnRefNo limit), alphanumeric, globally unique. */
export function generateTxnRef() {
  return `OP${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`.slice(0, 20);
}

export async function startOnlinePayment(ctx: ResidentContext, raw: StartOnlinePaymentInput): Promise<{ onlinePaymentId: string; txnRef: string; form: CheckoutForm }> {
  const input = parseInput(startOnlinePaymentSchema, raw);
  await enforceRateLimit(`online-pay:${ctx.userId}`, START_RATE_LIMIT);

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, ...ownWhere(ctx), status: { not: "DRAFT" } },
    select: { id: true, invoiceNumber: true, hostelId: true, total: true, amountPaid: true, status: true },
  });
  if (!invoice) throw new NotFoundError("Invoice");
  if (!RECEIVABLE_STATUSES.includes(invoice.status)) throw new BusinessRuleError("This invoice has nothing left to pay.");
  const amount = round2(toNumber(invoice.total) - toNumber(invoice.amountPaid));
  if (amount <= 0) throw new BusinessRuleError("This invoice has nothing left to pay.");
  if (ctx.organization.currency !== ONLINE_CURRENCY) throw new BusinessRuleError("Online payments are only available for PKR invoices.");

  const adapter = getAdapter(input.provider);
  const creds = await loadGatewayCredentials(ctx.organizationId, input.provider);
  if (!creds || !creds.enabled || !adapter.isConfigured(creds)) {
    throw new BusinessRuleError(`${paymentProviderLabels[input.provider]} isn't available for this hostel right now.`);
  }

  const resident = await prisma.resident.findFirst({
    where: { id: ctx.residentId, organizationId: ctx.organizationId },
    select: { email: true, phone: true, user: { select: { email: true } } },
  });
  const actor = await residentActor(ctx);
  const now = new Date();
  now.setMilliseconds(0);
  const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MINUTES * 60_000);
  const txnRef = generateTxnRef();
  const form = adapter.buildCheckout(creds, {
    txnRef,
    amount,
    currency: ONLINE_CURRENCY,
    billReference: invoice.invoiceNumber,
    description: `Invoice ${invoice.invoiceNumber}`,
    createdAt: now,
    expiresAt,
    returnUrl: returnUrlFor(input.provider),
    customer: { email: resident?.user?.email ?? resident?.email ?? null, phone: resident?.phone ?? null },
  });

  const created = await prisma.$transaction(async (tx) => {
    // Older unfinished attempts are superseded. A late success on one of them
    // is still recorded (completion accepts CANCELLED/EXPIRED rows).
    await tx.onlinePayment.updateMany({
      where: { organizationId: ctx.organizationId, invoiceId: invoice.id, residentId: ctx.residentId, status: "PENDING" },
      data: { status: "CANCELLED", responseMessage: "Superseded by a newer attempt" },
    });
    const row = await tx.onlinePayment.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: invoice.hostelId,
        residentId: ctx.residentId,
        invoiceId: invoice.id,
        provider: input.provider,
        environment: creds.environment,
        amount,
        currency: ONLINE_CURRENCY,
        status: "PENDING",
        txnRef,
        initiatedByUserId: ctx.userId,
        createdAt: now,
        expiresAt,
      },
    });
    await audit(
      actor,
      {
        action: "payment.online_started",
        entityType: "OnlinePayment",
        entityId: row.id,
        metadata: { provider: input.provider, txnRef, amount, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
      },
      tx,
    );
    return row;
  });
  return { onlinePaymentId: created.id, txnRef, form };
}

// ─── Completion (gateway callbacks) ─────────────────────────────────────────

export type CompletionResult = {
  status: OnlinePaymentStatus;
  invoiceId: string | null;
  /** True when this call changed the payment's state. */
  changed: boolean;
  /** Unverified browser claim, for choosing a banner while the payment stays PENDING. */
  hint?: "failed" | "cancelled" | null;
};

type OnlinePaymentRow = Prisma.OnlinePaymentGetPayload<object>;

/**
 * Handle a return/IPN from the gateway. Authenticity comes only from the
 * adapter's signature check or server-side inquiry; unverifiable payloads
 * never change state.
 */
export async function completeOnlinePayment(
  provider: PaymentProvider,
  payload: CallbackPayload,
  meta: { source: "return" | "ipn" | "simulator"; ip?: string | null } = { source: "return" },
): Promise<CompletionResult> {
  const adapter = getAdapter(provider);
  const txnRef = adapter.extractTxnRef(payload);
  if (!txnRef) throw new GatewayVerificationError("Missing transaction reference.");
  if (meta.ip) await enforceRateLimit(`online-cb:${meta.ip}`, CALLBACK_RATE_LIMIT);

  const row = await prisma.onlinePayment.findUnique({ where: { txnRef } });
  if (!row || row.provider !== provider) throw new GatewayVerificationError("Unknown transaction reference.");
  if (row.status === "SUCCEEDED") return { status: row.status, invoiceId: row.invoiceId, changed: false };

  const creds = await loadGatewayCredentials(row.organizationId, provider);
  if (!creds) throw new GatewayVerificationError("Gateway is not configured for this organization.");

  let verified: VerifiedResult;
  try {
    verified = await adapter.verifyCallback(creds, payload, { txnRef: row.txnRef, createdAt: row.createdAt });
  } catch (error) {
    await recordVerificationFailure(row, error, meta.source);
    throw error;
  }
  const result = await applyVerifiedResult(row, verified, meta.source);
  return { ...result, hint: meta.source === "return" ? (adapter.browserHint?.(payload) ?? null) : null };
}

export type ReturnHandling = { kind: "form"; form: CheckoutForm } | { kind: "redirect"; path: string };

/** Cookie holding the txnRef of the checkout in progress (to resume multi-step gateway flows). */
export const CHECKOUT_COOKIE = "hms_checkout";

function resultParam(result: CompletionResult): PaymentResultParam {
  switch (result.status) {
    case "SUCCEEDED":
      return "success";
    case "CANCELLED":
      return "cancelled";
    case "FAILED":
    case "EXPIRED":
      return "failed";
    default:
      return result.hint ?? "pending";
  }
}

/**
 * Browser return from a gateway. Either continues a multi-step checkout
 * (Easypaisa's auth_token → Confirm.jsf) or completes the payment and sends
 * the resident back to the invoice with a result banner.
 */
export async function handleGatewayReturn(
  provider: PaymentProvider,
  payload: CallbackPayload,
  request: { checkoutRef?: string | null; referer?: string | null; ip?: string | null },
): Promise<ReturnHandling> {
  const adapter = getAdapter(provider);
  const knownRef = adapter.extractTxnRef(payload) ?? request.checkoutRef ?? null;
  const row = knownRef
    ? await prisma.onlinePayment.findUnique({ where: { txnRef: knownRef }, select: { provider: true, environment: true, invoiceId: true } })
    : null;
  const own = row && row.provider === provider ? row : null;
  const invoicePath = (param: PaymentResultParam) => (own ? `/portal/invoices/${own.invoiceId}?payment=${param}` : `/portal/invoices?payment=${param}`);

  const step = adapter.classifyReturn(payload, {
    environment: own?.environment ?? adapter.environmentFromReferer?.(request.referer ?? null) ?? null,
    returnUrl: returnUrlFor(provider),
  });
  if (!step) return { kind: "redirect", path: invoicePath("error") };
  if (step.kind === "continue") return { kind: "form", form: step.form };

  try {
    const result = await completeOnlinePayment(provider, payload, { source: provider === "SIMULATOR" ? "simulator" : "return", ip: request.ip });
    return { kind: "redirect", path: invoicePath(resultParam(result)) };
  } catch (error) {
    if (error instanceof GatewayVerificationError) return { kind: "redirect", path: invoicePath("error") };
    // Transient (network/timeout/DB): the payment stays PENDING and the daily reconcile re-checks it.
    console.error(`[payments] ${provider} return failed`, error);
    return { kind: "redirect", path: invoicePath("pending") };
  }
}

/**
 * Server-to-server notification. The adapter extracts a reference; the
 * outcome is then established exactly like a browser return (signature or
 * inquiry), so a forged notification can at most trigger a status check.
 */
export async function handleGatewayIpn(provider: PaymentProvider, payload: CallbackPayload): Promise<CompletionResult> {
  const adapter = getAdapter(provider);
  const normalized = adapter.parseIpn?.(payload);
  if (!normalized) throw new GatewayVerificationError("Unrecognized notification.");
  return completeOnlinePayment(provider, normalized, { source: "ipn" });
}

async function recordVerificationFailure(row: OnlinePaymentRow, error: unknown, source: string) {
  const reason = error instanceof Error ? error.message : "Verification failed";
  try {
    const actorUserId = await actingUserId(row);
    await audit(
      { organizationId: row.organizationId, userId: actorUserId },
      {
        action: "payment.online_verification_failed",
        entityType: "OnlinePayment",
        entityId: row.id,
        metadata: { provider: row.provider, txnRef: row.txnRef, source, reason: reason.slice(0, 200) },
      },
    );
  } catch (auditError) {
    console.error("[payments] could not audit verification failure", auditError);
  }
}

/** The resident who started the payment, or the organization owner if that account is gone. */
async function actingUserId(row: Pick<OnlinePaymentRow, "organizationId" | "initiatedByUserId">, db: Tx | typeof prisma = prisma) {
  if (row.initiatedByUserId) return row.initiatedByUserId;
  const owner = await db.organizationMember.findFirst({
    where: { organizationId: row.organizationId, isOwner: true },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) throw new Error("Organization has no owner to attribute the online payment to");
  return owner.userId;
}

/**
 * Context for recording the ledger entry on behalf of the organization. It is
 * never exposed to request handlers; permissions are irrelevant because
 * recordPaymentTx does not check them. Records are addressed by explicit ids
 * taken from the verified OnlinePayment row, within its organization only
 * (org-wide so a resident transferred to another hostel still resolves).
 */
async function organizationActingContext(tx: Tx, row: OnlinePaymentRow): Promise<TenantContext> {
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: row.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      timezone: true,
      locale: true,
      logoFileId: true,
      brandName: true,
      primaryColor: true,
      onboardingCompletedAt: true,
    },
  });
  const userId = await actingUserId(row, tx);
  return {
    userId,
    userName: "Online payment",
    userEmail: "",
    organizationId: org.id,
    organization: org,
    memberId: "",
    roleId: "",
    roleKey: "system",
    roleName: "System",
    isOwner: false,
    permissions: new Set<Permission>(ALL_PERMISSIONS.filter((p) => p === "payments.manage")),
    allHostels: true,
    accessibleHostelIds: [row.hostelId],
    activeHostelId: row.hostelId,
    staffId: null,
    ipAddress: null,
    userAgent: "payment-gateway",
  };
}

const TERMINAL_FAILURE: OnlinePaymentStatus[] = ["FAILED", "CANCELLED", "EXPIRED"];

async function applyVerifiedResult(row: OnlinePaymentRow, verified: VerifiedResult, source: string): Promise<CompletionResult> {
  if (verified.txnRef !== row.txnRef) throw new GatewayVerificationError("Reference mismatch.");
  const label = paymentProviderLabels[row.provider];

  if (verified.outcome === "PENDING") {
    await prisma.onlinePayment.update({
      where: { id: row.id },
      data: {
        responseCode: verified.responseCode,
        responseMessage: verified.responseMessage,
        lastCheckedAt: new Date(),
        ...(verified.gatewayTxnId ? { gatewayTxnId: verified.gatewayTxnId } : {}),
      },
    });
    return { status: row.status, invoiceId: row.invoiceId, changed: false };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    // Row lock: concurrent return + IPN + reconcile for the same payment serialize here.
    await tx.$queryRaw`SELECT id FROM "OnlinePayment" WHERE id = ${row.id} FOR UPDATE`;
    const current = await tx.onlinePayment.findUniqueOrThrow({ where: { id: row.id } });
    if (current.status === "SUCCEEDED") return { status: current.status, changed: false, payments: [] as { id: string; receiptNumber: string; amount: Prisma.Decimal }[] };

    const actorUserId = await actingUserId(current, tx);
    const actor: AuditActor = { organizationId: current.organizationId, userId: actorUserId, userAgent: "payment-gateway" };
    const rawResponse = { source, verifiedBy: verified.verifiedBy, ...verified.raw } as Prisma.InputJsonValue;

    if (verified.outcome !== "SUCCEEDED") {
      // A failure never downgrades a success, and repeated failures are no-ops.
      if (TERMINAL_FAILURE.includes(current.status) && current.status !== "CANCELLED") {
        return { status: current.status, changed: false, payments: [] };
      }
      const status: OnlinePaymentStatus = verified.outcome === "CANCELLED" ? "CANCELLED" : "FAILED";
      await tx.onlinePayment.update({
        where: { id: current.id },
        data: {
          status,
          responseCode: verified.responseCode,
          responseMessage: verified.responseMessage,
          gatewayTxnId: verified.gatewayTxnId ?? current.gatewayTxnId,
          rawResponse,
          completedAt: new Date(),
          lastCheckedAt: new Date(),
        },
      });
      await audit(
        actor,
        {
          action: "payment.online_failed",
          entityType: "OnlinePayment",
          entityId: current.id,
          metadata: { provider: current.provider, txnRef: current.txnRef, status, responseCode: verified.responseCode, responseMessage: verified.responseMessage, source },
        },
        tx,
      );
      return { status, changed: true, payments: [] };
    }

    const expected = round2(toNumber(current.amount));
    if (verified.amount !== null && round2(verified.amount) !== expected) {
      await tx.onlinePayment.update({
        where: { id: current.id },
        data: {
          status: "FAILED",
          responseCode: verified.responseCode,
          responseMessage: `Amount mismatch: gateway reported ${verified.amount.toFixed(2)}, expected ${expected.toFixed(2)}. Review with ${label}.`,
          gatewayTxnId: verified.gatewayTxnId,
          rawResponse,
          completedAt: new Date(),
        },
      });
      await audit(
        actor,
        {
          action: "payment.online_amount_mismatch",
          entityType: "OnlinePayment",
          entityId: current.id,
          metadata: { provider: current.provider, txnRef: current.txnRef, expected, reported: verified.amount, source },
        },
        tx,
      );
      return { status: "FAILED" as const, changed: true, payments: [] };
    }

    const ctx = await organizationActingContext(tx, current);
    // Decide where the money goes. The gateway already charged the resident, so
    // it is always recorded: on the invoice while it has a balance, with any
    // excess (or everything, if the invoice was settled/cancelled meanwhile)
    // kept as advance credit.
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${current.invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: current.invoiceId },
      select: { status: true, total: true, amountPaid: true, invoiceNumber: true },
    });
    const balance = round2(toNumber(invoice.total) - toNumber(invoice.amountPaid));
    const applyToInvoice = RECEIVABLE_STATUSES.includes(invoice.status) && balance > 0;
    const reference = (verified.gatewayTxnId || current.txnRef).slice(0, 120);
    const input = paymentSchema.parse({
      residentId: current.residentId,
      invoiceId: applyToInvoice ? current.invoiceId : undefined,
      amount: expected,
      method: "ONLINE",
      reference,
      paymentDate: todayInTimeZone(ctx.organization.timezone),
      notes: applyToInvoice
        ? `Paid online via ${label} (ref ${current.txnRef})`
        : `Paid online via ${label} for ${invoice.invoiceNumber} (ref ${current.txnRef}); kept as credit because the invoice no longer had a balance`,
      recordExcessAsAdvance: true,
    });
    const payments = await recordPaymentTx(tx, ctx, input);
    // Nobody at the office received this money; clear the acting user.
    await tx.payment.updateMany({ where: { id: { in: payments.map((p) => p.id) } }, data: { receivedById: null } });

    await tx.onlinePayment.update({
      where: { id: current.id },
      data: {
        status: "SUCCEEDED",
        paymentId: payments[0]!.id,
        gatewayTxnId: verified.gatewayTxnId,
        responseCode: verified.responseCode,
        responseMessage: verified.responseMessage,
        rawResponse,
        completedAt: new Date(),
        lastCheckedAt: new Date(),
      },
    });
    await audit(
      actor,
      {
        action: "payment.online_succeeded",
        entityType: "OnlinePayment",
        entityId: current.id,
        before: { status: current.status },
        after: { status: "SUCCEEDED", paymentId: payments[0]!.id },
        metadata: {
          provider: current.provider,
          txnRef: current.txnRef,
          gatewayTxnId: verified.gatewayTxnId,
          amount: expected,
          verifiedBy: verified.verifiedBy,
          appliedToInvoice: applyToInvoice,
          receipts: payments.map((p) => p.receiptNumber),
          source,
        },
      },
      tx,
    );
    return { status: "SUCCEEDED" as const, changed: true, payments };
  });

  if (outcome.status === "SUCCEEDED" && outcome.changed) {
    await notifySuccess(row, outcome.payments[0]?.receiptNumber ?? "");
  }
  return { status: outcome.status, invoiceId: row.invoiceId, changed: outcome.changed };
}

async function notifySuccess(row: OnlinePaymentRow, receiptNumber: string) {
  const org = await prisma.organization.findUnique({ where: { id: row.organizationId }, select: { currency: true, locale: true } });
  const amount = formatMoney(toNumber(row.amount), org?.currency ?? ONLINE_CURRENCY, org?.locale ?? "en");
  const label = paymentProviderLabels[row.provider];
  await notifyResident(row.organizationId, row.residentId, {
    type: "PAYMENT_RECEIVED",
    title: "Payment received",
    body: `Your online payment of ${amount} via ${label} was successful. Receipt ${receiptNumber}.`,
    link: `/portal/invoices/${row.invoiceId}`,
  });
  const resident = await prisma.resident.findUnique({ where: { id: row.residentId }, select: { firstName: true, lastName: true } });
  await notifyMembers(row.organizationId, "payments.view", row.hostelId, {
    type: "PAYMENT_RECEIVED",
    title: "Online payment received",
    body: `${resident ? `${resident.firstName} ${resident.lastName}` : "A resident"} paid ${amount} via ${label}. Receipt ${receiptNumber}.`,
    link: `/finance/invoices/${row.invoiceId}`,
  });
}

// ─── Reconciliation (daily job) ─────────────────────────────────────────────

/**
 * Re-check stale PENDING payments with the gateway's inquiry API (catches
 * customers who paid but never returned to the site) and expire abandoned
 * ones. Safe to run repeatedly; completion is idempotent.
 */
export async function reconcileOnlinePayments(options: { now?: Date; limit?: number } = {}) {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - RECONCILE_AFTER_MINUTES * 60_000);
  const rows = await prisma.onlinePayment.findMany({
    where: { status: "PENDING", createdAt: { lt: staleBefore } },
    orderBy: { createdAt: "asc" },
    take: options.limit ?? 200,
  });
  const summary = { checked: 0, succeeded: 0, failed: 0, expired: 0, errors: 0 };
  for (const row of rows) {
    summary.checked++;
    const adapter = getAdapter(row.provider);
    let result: CompletionResult | null = null;
    try {
      const creds = adapter.inquire ? await loadGatewayCredentials(row.organizationId, row.provider) : null;
      if (adapter.inquire && creds && adapter.isConfigured(creds)) {
        const verified = await adapter.inquire(creds, { txnRef: row.txnRef, createdAt: row.createdAt });
        result = await applyVerifiedResult(row, verified, "reconcile");
      }
    } catch (error) {
      summary.errors++;
      console.error(`[payments] reconcile ${row.txnRef} failed`, error);
    }
    if (result?.status === "SUCCEEDED") summary.succeeded++;
    else if (result?.status === "FAILED" || result?.status === "CANCELLED") summary.failed++;
    else if (row.expiresAt.getTime() + EXPIRE_GRACE_MINUTES * 60_000 < now.getTime()) {
      const expired = await prisma.onlinePayment.updateMany({
        where: { id: row.id, status: "PENDING" },
        data: { status: "EXPIRED", responseMessage: "Checkout expired without a confirmed payment", lastCheckedAt: now },
      });
      summary.expired += expired.count;
    }
  }
  return summary;
}

// ─── Queries ────────────────────────────────────────────────────────────────

const attemptSelect = {
  id: true,
  provider: true,
  environment: true,
  amount: true,
  currency: true,
  status: true,
  txnRef: true,
  gatewayTxnId: true,
  responseMessage: true,
  createdAt: true,
  completedAt: true,
  payment: { select: { id: true, receiptNumber: true } },
} satisfies Prisma.OnlinePaymentSelect;

/** A resident's own attempts for one invoice (portal invoice page). */
export async function listPortalInvoiceOnlinePayments(ctx: ResidentContext, rawInvoiceId: string) {
  const invoiceId = parseInput(idSchema, rawInvoiceId);
  const rows = await prisma.onlinePayment.findMany({
    where: { ...ownWhere(ctx), invoiceId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: attemptSelect,
  });
  return serialize(rows);
}

/** Pending attempt the simulator page acts on — only the resident's own. */
export async function getPortalSimulatorPayment(ctx: ResidentContext, rawRef: string) {
  if (!simulatorEnabled()) throw new NotFoundError("Payment");
  const txnRef = parseInput(idSchema, rawRef);
  const row = await prisma.onlinePayment.findFirst({
    where: { ...ownWhere(ctx), txnRef, provider: "SIMULATOR" },
    select: { ...attemptSelect, invoice: { select: { id: true, invoiceNumber: true } } },
  });
  if (!row) throw new NotFoundError("Payment");
  return serialize(row);
}

export type StaffOnlinePaymentFilters = { status?: OnlinePaymentStatus; take?: number };

/** Recent online attempts across the member's hostels (payments page). */
export async function listRecentOnlinePayments(ctx: TenantContext, filters: StaffOnlinePaymentFilters = {}) {
  requirePermission(ctx, "payments.view");
  const rows = await prisma.onlinePayment.findMany({
    where: { ...scopedWhere(ctx), ...(filters.status ? { status: filters.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(filters.take ?? 50, 1), 200),
    select: {
      ...attemptSelect,
      responseCode: true,
      resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
      hostel: { select: { id: true, name: true } },
    },
  });
  return serialize(rows);
}

export type StaffOnlinePaymentRow = Awaited<ReturnType<typeof listRecentOnlinePayments>>[number];

export async function countOnlinePaymentsByStatus(ctx: TenantContext) {
  requirePermission(ctx, "payments.view");
  const groups = await prisma.onlinePayment.groupBy({ by: ["status"], where: scopedWhere(ctx), _count: { _all: true } });
  return Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Partial<Record<OnlinePaymentStatus, number>>;
}
