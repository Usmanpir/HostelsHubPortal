import { createCipheriv } from "node:crypto";
import type { GatewayEnvironment } from "@/generated/prisma/enums";
import {
  GatewayVerificationError,
  sanitizePayload,
  type CheckoutForm,
  type CheckoutRequest,
  type GatewayCredentials,
  type GatewayOutcome,
  type PaymentGatewayAdapter,
  type VerifiedResult,
} from "./types";

/**
 * Easypaisa (Easypay) hosted checkout — Index.jsf → Confirm.jsf redirect flow.
 *
 *   1. Browser POSTs storeId, amount, postBackURL, orderRefNum, expiryDate,
 *      merchantHashedReq … to Index.jsf.
 *   2. Easypaisa redirects to postBackURL?auth_token=…; we answer with an
 *      auto-submitting form that POSTs auth_token + postBackURL to Confirm.jsf.
 *   3. After payment the customer lands on postBackURL with status, desc and
 *      orderRefNumber. These are NOT signed, so they are never trusted: the
 *      outcome always comes from the server-side Inquire Transaction API.
 *
 * The Easypaisa merchant guide (v4.1.2) is not publicly downloadable; field
 * names, URLs and the AES/ECB/PKCS5 merchantHashedReq scheme follow excerpts
 * of that guide and widely used integrations. Everything provider-specific is
 * isolated in this file.
 */

export const EASYPAISA_URLS: Record<GatewayEnvironment, { index: string; confirm: string; inquiry: string; hosts: string[] }> = {
  SANDBOX: {
    index: "https://easypaystg.easypaisa.com.pk/easypay/Index.jsf",
    confirm: "https://easypaystg.easypaisa.com.pk/easypay/Confirm.jsf",
    inquiry: "https://easypaystg.easypaisa.com.pk/easypay-service/rest/v4/inquire-transaction",
    hosts: ["easypaystg.easypaisa.com.pk"],
  },
  LIVE: {
    index: "https://easypay.easypaisa.com.pk/easypay/Index.jsf",
    confirm: "https://easypay.easypaisa.com.pk/easypay/Confirm.jsf",
    inquiry: "https://easypay.easypaisa.com.pk/easypay-service/rest/v4/inquire-transaction",
    hosts: ["easypay.easypaisa.com.pk"],
  },
};

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** "YYYYMMDD HHMMSS" in Pakistan time. */
export function formatEasypaisaExpiry(date: Date) {
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
  return `${get("year")}${get("month")}${get("day")} ${get("hour")}${get("minute")}${get("second")}`;
}

/** Easypaisa samples send one decimal ("10.0"); keep two only when the paisa digit matters. */
export function formatEasypaisaAmount(amount: number) {
  const cents = Math.round(amount * 100);
  return cents % 10 === 0 ? (cents / 100).toFixed(1) : (cents / 100).toFixed(2);
}

/** Pakistani mobile numbers in the 03XXXXXXXXX form Easypaisa expects, or "" if not recognizable. */
export function easypaisaMobile(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (/^923\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^03\d{9}$/.test(digits)) return digits;
  return "";
}

/** Fields covered by merchantHashedReq, in the order the guide's sample uses (alphabetical). */
const HASHED_FIELDS = ["amount", "autoRedirect", "emailAddr", "expiryDate", "mobileNum", "orderRefNum", "paymentMethod", "postBackURL", "storeId"] as const;

export function easypaisaHashString(fields: Record<string, string | undefined>) {
  return [...HASHED_FIELDS]
    .sort()
    .filter((k) => fields[k] !== undefined && fields[k] !== "")
    .map((k) => `${k}=${fields[k]}`)
    .join("&");
}

/** AES/ECB/PKCS5Padding with the merchant hash key, base64 output. */
export function easypaisaEncrypt(plain: string, hashKey: string) {
  const key = Buffer.from(hashKey, "utf8");
  const algorithm = key.length === 16 ? "aes-128-ecb" : key.length === 24 ? "aes-192-ecb" : key.length === 32 ? "aes-256-ecb" : null;
  if (!algorithm) throw new GatewayVerificationError("The Easypaisa hash key must be 16 characters.");
  const cipher = createCipheriv(algorithm, key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("base64");
}

export function buildEasypaisaFields(creds: GatewayCredentials, request: CheckoutRequest): Record<string, string> {
  const fields: Record<string, string> = {
    storeId: creds.merchantId,
    amount: formatEasypaisaAmount(request.amount),
    postBackURL: request.returnUrl,
    orderRefNum: request.txnRef,
    expiryDate: formatEasypaisaExpiry(request.expiresAt),
    autoRedirect: "1",
    paymentMethod: "",
    emailAddr: request.customer.email?.slice(0, 100) ?? "",
    mobileNum: easypaisaMobile(request.customer.phone),
  };
  fields.merchantHashedReq = easypaisaEncrypt(easypaisaHashString(fields), creds.secrets.hashKey ?? "");
  // Omit empty optional fields from the form itself.
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== ""));
}

export function easypaisaOutcome(transactionStatus: string | null | undefined): GatewayOutcome {
  switch ((transactionStatus ?? "").toUpperCase()) {
    case "PAID":
      return "SUCCEEDED";
    case "FAILED":
    case "BLOCKED":
    case "REVERSED":
    case "EXPIRED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

/** Map an Inquire Transaction response. responseCode "0000" = inquiry succeeded. */
export function easypaisaInquiryResult(txnRef: string, response: Record<string, unknown>): VerifiedResult {
  const fields = Object.fromEntries(Object.entries(response).map(([k, v]) => [k, str(v)]));
  const code = fields.responseCode ?? null;
  if (code && code !== "0000" && code !== "0003") {
    // Configuration problems (bad credentials, store id …) — surface, don't guess.
    throw new GatewayVerificationError(`Easypaisa inquiry error ${code}${fields.responseDesc ? `: ${fields.responseDesc}` : ""}`);
  }
  const outcome: GatewayOutcome = code === "0000" ? easypaisaOutcome(fields.transactionStatus) : "PENDING";
  if (code === "0000" && fields.orderId && fields.orderId !== txnRef) throw new GatewayVerificationError("Easypaisa inquiry returned another order.");
  const amount = fields.transactionAmount ? Number(fields.transactionAmount) : NaN;
  return {
    txnRef,
    outcome,
    amount: Number.isFinite(amount) ? amount : null,
    gatewayTxnId: fields.transactionId ?? fields.transactionRefNumber ?? null,
    responseCode: fields.transactionStatus ?? code,
    responseMessage: (code === "0003" ? "Order not found at Easypaisa yet" : fields.responseDesc)?.slice(0, 300) ?? null,
    verifiedBy: "inquiry",
    raw: sanitizePayload(fields, ["msisdn"]),
  };
}

async function callInquiry(creds: GatewayCredentials, txnRef: string) {
  const credentials = Buffer.from(`${creds.secrets.apiUsername ?? ""}:${creds.secrets.apiPassword ?? ""}`).toString("base64");
  const res = await fetch(EASYPAISA_URLS[creds.environment].inquiry, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Credentials: credentials },
    body: JSON.stringify({ orderId: txnRef, storeId: creds.merchantId, accountNum: creds.subMerchantId ?? "" }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new GatewayVerificationError(`Easypaisa inquiry failed with HTTP ${res.status}.`);
  const json: unknown = await res.json();
  if (!json || typeof json !== "object") throw new GatewayVerificationError("Unexpected Easypaisa inquiry response.");
  return json as Record<string, unknown>;
}

/**
 * Easypaisa's IPN calls `yourUrl?url=https://easypay…/easypay-service/rest/v1/order-status/<account>/<orderId>`.
 * We only extract the order id (after checking the URL points at Easypaisa)
 * and then verify via inquiry — nothing in the notification is trusted.
 */
/** Which Easypaisa environment a Referer header came from (fallback when our checkout cookie is missing). */
export function easypaisaEnvironmentFromReferer(referer: string | null | undefined): GatewayEnvironment | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname;
    if (EASYPAISA_URLS.SANDBOX.hosts.includes(host)) return "SANDBOX";
    if (EASYPAISA_URLS.LIVE.hosts.includes(host)) return "LIVE";
  } catch {
    return null;
  }
  return null;
}

export function easypaisaOrderFromIpnUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const hosts = [...EASYPAISA_URLS.SANDBOX.hosts, ...EASYPAISA_URLS.LIVE.hosts];
  if (url.protocol !== "https:" || !hosts.includes(url.hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("order-status");
  if (idx < 0 || segments.length < idx + 3) return null;
  const orderId = decodeURIComponent(segments[segments.length - 1]!);
  return /^[A-Za-z0-9._-]{1,40}$/.test(orderId) ? orderId : null;
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export const easypaisaAdapter: PaymentGatewayAdapter = {
  provider: "EASYPAISA",
  label: "Easypaisa",
  merchantIdLabel: "Store ID",
  subMerchantIdLabel: "Easypaisa account number",
  subMerchantIdRequired: true,
  secretFields: [
    { key: "hashKey", label: "Hash key", help: "From Merchant Portal → Account Settings → Generate Hash Key (16 characters).", required: true },
    { key: "apiUsername", label: "API username", help: "Easypay web-service username, used to confirm each payment server-side.", required: true },
    { key: "apiPassword", label: "API password", help: "Easypay web-service password.", required: true },
  ],
  supportsInquiry: true,

  isConfigured: (c) => !!c.merchantId && !!c.subMerchantId && !!c.secrets.hashKey && !!c.secrets.apiUsername && !!c.secrets.apiPassword,

  buildCheckout(creds, request): CheckoutForm {
    return { actionUrl: EASYPAISA_URLS[creds.environment].index, method: "POST", fields: buildEasypaisaFields(creds, request) };
  },

  extractTxnRef: (payload) => payload.orderRefNumber || payload.orderRefNum || payload.orderId || null,

  classifyReturn(payload, { environment, returnUrl }) {
    if (payload.auth_token) {
      if (!environment) return null;
      return {
        kind: "continue",
        form: { actionUrl: EASYPAISA_URLS[environment].confirm, method: "POST", fields: { auth_token: payload.auth_token, postBackURL: returnUrl } },
      };
    }
    const txnRef = payload.orderRefNumber || payload.orderRefNum;
    return txnRef ? { kind: "result", txnRef } : null;
  },

  async verifyCallback(creds, _payload, txn) {
    // The browser postback is unsigned: always confirm with Easypaisa.
    return easypaisaInquiryResult(txn.txnRef, await callInquiry(creds, txn.txnRef));
  },

  async inquire(creds, txn) {
    return easypaisaInquiryResult(txn.txnRef, await callInquiry(creds, txn.txnRef));
  },

  browserHint(payload) {
    const status = (payload.status ?? "").toLowerCase();
    if (!status || status === "success" || status === "0000") return null;
    return /cancel/.test(status) || /cancel/i.test(payload.desc ?? "") ? "cancelled" : "failed";
  },

  environmentFromReferer: easypaisaEnvironmentFromReferer,

  parseIpn(payload) {
    const orderId = easypaisaOrderFromIpnUrl(payload.url);
    return orderId ? { orderRefNumber: orderId } : null;
  },

  async testConnection(creds) {
    try {
      easypaisaEncrypt("test", creds.secrets.hashKey ?? "");
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Invalid hash key." };
    }
    const response = await callInquiry(creds, `TEST${Date.now()}`.slice(0, 20));
    const code = str(response.responseCode);
    const desc = str(response.responseDesc) ?? "";
    if (code === "0000" || code === "0003") return { ok: true, message: "Easypaisa accepted the store ID and API credentials." };
    if (code === "0010") return { ok: false, message: "Easypaisa rejected the API username or password." };
    if (code === "0006") return { ok: false, message: "Easypaisa doesn't recognise this store ID." };
    return { ok: false, message: `Easypaisa responded with ${code ?? "an unknown code"}${desc ? `: ${desc}` : ""}.` };
  },
};
