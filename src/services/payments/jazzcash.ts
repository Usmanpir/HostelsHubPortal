import { createHmac, timingSafeEqual } from "node:crypto";
import type { GatewayEnvironment } from "@/generated/prisma/enums";
import {
  GatewayVerificationError,
  sanitizePayload,
  type CallbackPayload,
  type CheckoutForm,
  type CheckoutRequest,
  type GatewayCredentials,
  type GatewayOutcome,
  type PaymentGatewayAdapter,
  type VerifiedResult,
} from "./types";

/**
 * JazzCash "Page Redirection" hosted checkout, v1.1.
 *
 * Verified against the official sandbox documentation
 * (https://sandbox.jazzcash.com.pk/SandboxDocumentation/features.html and the
 * Merchant Integration Guide v4.2):
 *  - pp_Amount is in paisa (no decimals); pp_TxnDateTime / pp_TxnExpiryDateTime are yyyyMMddHHmmss
 *  - pp_SecureHash = HMAC-SHA256(key = Integrity Salt, message = salt + "&" + values of
 *    all "pp*" fields sorted by name, joined with "&")
 *  - pp_ResponseCode "000" = success; the return POST carries a pp_SecureHash computed the same way
 *
 * Only from community integrations (kept here, in one place): the exact
 * sandbox/live host names below, the inquiry response field names
 * (pp_PaymentResponseCode, pp_Status) and PKT as the timestamp time zone.
 */

export const JAZZCASH_URLS: Record<GatewayEnvironment, { checkout: string; inquiry: string }> = {
  SANDBOX: {
    checkout: "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
    inquiry: "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire",
  },
  LIVE: {
    checkout: "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
    inquiry: "https://payments.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire",
  },
};

const SUCCESS_CODES = new Set(["000", "121"]);
/** Voucher placed / wallet or authorization pending — not final yet. */
const PENDING_CODES = new Set(["124", "157", "210"]);
const CANCELLED_CODES = new Set(["112"]);

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** yyyyMMddHHmmss in Pakistan time (UTC+5, no DST). */
export function formatJazzcashDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

/** Major units → paisa string. */
export function toPaisa(amount: number) {
  return String(Math.round(amount * 100));
}

/**
 * The message JazzCash signs: salt, then the values of every non-empty field
 * whose name starts with "pp" (pp_*, ppmpf_*), sorted by field name, "&"-joined.
 */
export function jazzcashHashMessage(fields: Record<string, string | undefined | null>, integritySalt: string) {
  const values = Object.keys(fields)
    .filter((k) => k.startsWith("pp") && k !== "pp_SecureHash")
    .sort()
    .map((k) => fields[k])
    .filter((v): v is string => typeof v === "string" && v !== "");
  return [integritySalt, ...values].join("&");
}

export function jazzcashSecureHash(fields: Record<string, string | undefined | null>, integritySalt: string) {
  return createHmac("sha256", integritySalt).update(jazzcashHashMessage(fields, integritySalt), "utf8").digest("hex").toUpperCase();
}

export function verifyJazzcashHash(fields: Record<string, string | undefined | null>, integritySalt: string) {
  const given = (fields.pp_SecureHash ?? "").trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(given)) return false;
  const expected = jazzcashSecureHash(fields, integritySalt);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/** pp_BillReference: alphanumeric and "." only, ≤ 20 chars. */
export function jazzcashBillReference(value: string) {
  return value.replace(/[^A-Za-z0-9.]/g, "").slice(0, 20) || "INVOICE";
}

/** pp_Description: ≤ 200 chars, without the characters JazzCash rejects or rewrites. */
export function jazzcashDescription(value: string) {
  return value.replace(/[<>*=%/:'"{}|&#\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Payment";
}

export function jazzcashOutcome(code: string | null | undefined): GatewayOutcome {
  if (!code) return "FAILED";
  if (SUCCESS_CODES.has(code)) return "SUCCEEDED";
  if (PENDING_CODES.has(code)) return "PENDING";
  if (CANCELLED_CODES.has(code)) return "CANCELLED";
  return "FAILED";
}

export function buildJazzcashFields(creds: GatewayCredentials, request: CheckoutRequest): Record<string, string> {
  const fields: Record<string, string> = {
    pp_Version: "1.1",
    // Empty = the customer picks wallet / card / voucher on JazzCash's page.
    pp_TxnType: "",
    pp_Language: "EN",
    pp_MerchantID: creds.merchantId,
    pp_SubMerchantID: creds.subMerchantId ?? "",
    pp_Password: creds.secrets.password ?? "",
    pp_BankID: "",
    pp_ProductID: "",
    pp_TxnRefNo: request.txnRef,
    pp_Amount: toPaisa(request.amount),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: formatJazzcashDateTime(request.createdAt),
    pp_BillReference: jazzcashBillReference(request.billReference),
    pp_Description: jazzcashDescription(request.description),
    pp_TxnExpiryDateTime: formatJazzcashDateTime(request.expiresAt),
    pp_ReturnURL: request.returnUrl,
    ppmpf_1: "",
    ppmpf_2: "",
    ppmpf_3: "",
    ppmpf_4: "",
    ppmpf_5: "",
  };
  fields.pp_SecureHash = jazzcashSecureHash(fields, creds.secrets.integritySalt ?? "");
  return fields;
}

/** Interpret a signed return / IPN payload (hash must already be verified). */
export function jazzcashResultFromPayload(payload: CallbackPayload, verifiedBy: VerifiedResult["verifiedBy"]): VerifiedResult {
  const code = payload.pp_ResponseCode ?? null;
  const paisa = payload.pp_Amount ? Number(payload.pp_Amount) : NaN;
  return {
    txnRef: payload.pp_TxnRefNo ?? "",
    outcome: jazzcashOutcome(code),
    amount: Number.isFinite(paisa) ? paisa / 100 : null,
    gatewayTxnId: payload.pp_RetreivalReferenceNo || payload.pp_RetrievalReferenceNo || payload.pp_AuthCode || null,
    responseCode: code,
    responseMessage: payload.pp_ResponseMessage?.slice(0, 300) ?? null,
    verifiedBy,
    raw: sanitizePayload(payload),
  };
}

// ─── Status inquiry ─────────────────────────────────────────────────────────

type InquiryResponse = Record<string, unknown>;

async function callInquiry(creds: GatewayCredentials, txnRef: string): Promise<InquiryResponse> {
  const body: Record<string, string> = {
    pp_TxnRefNo: txnRef,
    pp_MerchantID: creds.merchantId,
    pp_Password: creds.secrets.password ?? "",
    pp_Version: "1.1",
  };
  body.pp_SecureHash = jazzcashSecureHash(body, creds.secrets.integritySalt ?? "");
  const res = await fetch(JAZZCASH_URLS[creds.environment].inquiry, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new GatewayVerificationError(`JazzCash inquiry failed with HTTP ${res.status}.`);
  const json: unknown = await res.json();
  if (!json || typeof json !== "object") throw new GatewayVerificationError("Unexpected JazzCash inquiry response.");
  return json as InquiryResponse;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

/** Map an inquiry response. pp_ResponseCode is the inquiry status; the payment status is separate. */
export function jazzcashInquiryResult(txnRef: string, response: InquiryResponse, integritySalt: string): VerifiedResult {
  const fields = Object.fromEntries(Object.entries(response).map(([k, v]) => [k, str(v)]));
  if (fields.pp_SecureHash && !verifyJazzcashHash(fields, integritySalt)) {
    throw new GatewayVerificationError("JazzCash inquiry response hash mismatch.");
  }
  const inquiryCode = fields.pp_ResponseCode ?? fields.responseCode ?? null;
  const paymentCode = fields.pp_PaymentResponseCode ?? null;
  const status = (fields.pp_Status ?? fields.status ?? "").toLowerCase();
  const paisa = fields.pp_Amount ? Number(fields.pp_Amount) : NaN;
  let outcome: GatewayOutcome = "PENDING";
  if (inquiryCode === "000") {
    if (paymentCode) outcome = jazzcashOutcome(paymentCode);
    else if (status === "completed" || status === "success") outcome = "SUCCEEDED";
    else if (status === "failed" || status === "reversed" || status === "rejected") outcome = "FAILED";
  }
  return {
    txnRef,
    outcome,
    amount: Number.isFinite(paisa) ? paisa / 100 : null,
    gatewayTxnId: fields.pp_RetreivalReferenceNo ?? fields.rrn ?? fields.pp_AuthCode ?? null,
    responseCode: paymentCode ?? inquiryCode,
    responseMessage: (fields.pp_PaymentResponseMessage ?? fields.pp_ResponseMessage ?? fields.responseMessage ?? null)?.slice(0, 300) ?? null,
    verifiedBy: "inquiry",
    raw: sanitizePayload(fields),
  };
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export const jazzcashAdapter: PaymentGatewayAdapter = {
  provider: "JAZZCASH",
  label: "JazzCash",
  merchantIdLabel: "Merchant ID",
  subMerchantIdLabel: "Sub-merchant ID (optional)",
  subMerchantIdRequired: false,
  secretFields: [
    { key: "password", label: "Password", help: "pp_Password from the JazzCash merchant portal.", required: true },
    { key: "integritySalt", label: "Integrity salt", help: "Used to sign requests and verify responses (HMAC-SHA256).", required: true },
  ],
  supportsInquiry: true,

  isConfigured: (c) => !!c.merchantId && !!c.secrets.password && !!c.secrets.integritySalt,

  buildCheckout(creds, request): CheckoutForm {
    return { actionUrl: JAZZCASH_URLS[creds.environment].checkout, method: "POST", fields: buildJazzcashFields(creds, request) };
  },

  extractTxnRef: (payload) => payload.pp_TxnRefNo || null,

  classifyReturn: (payload) => (payload.pp_TxnRefNo ? { kind: "result", txnRef: payload.pp_TxnRefNo } : null),

  async verifyCallback(creds, payload, txn) {
    if (payload.pp_TxnRefNo !== txn.txnRef) throw new GatewayVerificationError("Reference mismatch.");
    if (payload.pp_SecureHash) {
      if (!verifyJazzcashHash(payload, creds.secrets.integritySalt ?? "")) throw new GatewayVerificationError("Invalid JazzCash secure hash.");
      if (payload.pp_MerchantID && payload.pp_MerchantID !== creds.merchantId) throw new GatewayVerificationError("Merchant mismatch.");
      return jazzcashResultFromPayload(payload, "signature");
    }
    // Unsigned payload: ignore its contents and ask JazzCash directly.
    return jazzcashInquiryResult(txn.txnRef, await callInquiry(creds, txn.txnRef), creds.secrets.integritySalt ?? "");
  },

  async inquire(creds, txn) {
    return jazzcashInquiryResult(txn.txnRef, await callInquiry(creds, txn.txnRef), creds.secrets.integritySalt ?? "");
  },

  parseIpn: (payload) => (payload.pp_TxnRefNo ? payload : null),

  async testConnection(creds) {
    if (!/^[A-Za-z0-9]{1,10}$/.test(creds.merchantId)) return { ok: false, message: "Merchant ID should be up to 10 letters or numbers." };
    const response = await callInquiry(creds, `TEST${Date.now()}`.slice(0, 20));
    const code = str(response.pp_ResponseCode) ?? str(response.responseCode);
    const message = str(response.pp_ResponseMessage) ?? str(response.responseMessage) ?? "";
    if (code === "101") return { ok: false, message: `JazzCash rejected the merchant ID or password${message ? `: ${message}` : "."}` };
    if (code === "115") return { ok: false, message: "JazzCash rejected the request signature — check the integrity salt." };
    return { ok: true, message: `JazzCash accepted the credentials${code ? ` (inquiry response ${code}${message ? `: ${message}` : ""})` : ""}.` };
  },
};
