import type { GatewayEnvironment, PaymentProvider } from "@/generated/prisma/enums";

/**
 * Gateway abstraction for hosted-checkout providers. Adapters are pure with
 * respect to the database: they build signed checkout forms, interpret and
 * verify what the gateway sends back, and (where supported) query the
 * gateway's transaction status API. All persistence and money movement lives
 * in online-payment-service.ts.
 */

/** Decrypted, per-organization merchant credentials. Never leaves the server. */
export type GatewayCredentials = {
  environment: GatewayEnvironment;
  merchantId: string;
  subMerchantId: string | null;
  secrets: Record<string, string>;
};

export type CheckoutRequest = {
  /** Our unique reference (pp_TxnRefNo / orderRefNum). */
  txnRef: string;
  /** Major units (PKR), 2 decimals. */
  amount: number;
  currency: string;
  /** Human-readable reference shown by the gateway (invoice number). */
  billReference: string;
  description: string;
  createdAt: Date;
  expiresAt: Date;
  /** Absolute URL the gateway sends the customer (and result) back to. */
  returnUrl: string;
  customer: { email?: string | null; phone?: string | null };
};

/** A form the browser submits to the gateway (auto-submitted by the portal). */
export type CheckoutForm = {
  actionUrl: string;
  method: "POST" | "GET";
  fields: Record<string, string>;
};

export type GatewayOutcome = "SUCCEEDED" | "FAILED" | "PENDING" | "CANCELLED";

/** A result whose authenticity has been established (signature or server-side inquiry). */
export type VerifiedResult = {
  txnRef: string;
  outcome: GatewayOutcome;
  /** Amount the gateway reports, in major units, when it reports one. */
  amount: number | null;
  gatewayTxnId: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  verifiedBy: "signature" | "inquiry";
  /** Sanitized payload (no hashes / secrets) for the audit trail. */
  raw: Record<string, unknown>;
};

/** Normalized browser/IPN payload: form fields or query params as strings. */
export type CallbackPayload = Record<string, string>;

/**
 * What to do with a browser return. Most providers return the final result
 * straight away; Easypaisa first returns an auth token that must be posted
 * back to its Confirm page before the customer can pay.
 */
export type ReturnStep = { kind: "continue"; form: CheckoutForm } | { kind: "result"; txnRef: string };

export type FieldSpec = {
  key: string;
  label: string;
  help?: string;
  /** Needed to take payments (vs. optional, e.g. only for status inquiry). */
  required: boolean;
};

export interface PaymentGatewayAdapter {
  provider: PaymentProvider;
  label: string;
  /** Label for the public identifier column (merchantId). */
  merchantIdLabel: string;
  subMerchantIdLabel: string | null;
  subMerchantIdRequired: boolean;
  secretFields: FieldSpec[];
  /** Whether stale PENDING payments can be re-checked server-side. */
  supportsInquiry: boolean;

  isConfigured(creds: Pick<GatewayCredentials, "merchantId" | "subMerchantId" | "secrets">): boolean;
  buildCheckout(creds: GatewayCredentials, request: CheckoutRequest): CheckoutForm;
  /** Our txnRef from a return/IPN payload, before verification (used to find the tenant). */
  extractTxnRef(payload: CallbackPayload): string | null;
  /**
   * Decide whether a browser return is an intermediate step or a final result.
   * `environment` comes from our own OnlinePayment row when it can be identified.
   */
  classifyReturn(payload: CallbackPayload, context: { environment: GatewayEnvironment | null; returnUrl: string }): ReturnStep | null;
  /**
   * Establish the authentic outcome of a callback. Implementations must not
   * trust unsigned fields — they either verify a signature or ask the gateway.
   */
  verifyCallback(creds: GatewayCredentials, payload: CallbackPayload, txn: { txnRef: string; createdAt: Date }): Promise<VerifiedResult>;
  inquire?(creds: GatewayCredentials, txn: { txnRef: string; createdAt: Date }): Promise<VerifiedResult>;
  /**
   * Unverified outcome the browser claims (UX only — used to pick the result
   * banner while the stored payment is still PENDING, never to change state).
   */
  browserHint?(payload: CallbackPayload): "failed" | "cancelled" | null;
  /** Environment implied by the Referer of an intermediate return step (fallback only). */
  environmentFromReferer?(referer: string | null): GatewayEnvironment | null;
  /** Normalize a server-to-server notification into a callback payload, or null if it isn't one. */
  parseIpn?(payload: CallbackPayload): CallbackPayload | null;
  /** Cheap credential sanity check for the settings screen. */
  testConnection(creds: GatewayCredentials): Promise<{ ok: boolean; message: string }>;
}

export class GatewayVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayVerificationError";
  }
}

/** Remove hash/secret-looking keys and cap sizes before storing a gateway payload. */
export function sanitizePayload(payload: Record<string, unknown>, extraSensitive: string[] = []): Record<string, unknown> {
  const sensitive = /hash|password|secret|salt|token|signature|credential/i;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload).slice(0, 60)) {
    if (sensitive.test(key) || extraSensitive.includes(key)) continue;
    if (typeof value === "string") out[key.slice(0, 64)] = value.slice(0, 500);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key.slice(0, 64)] = value;
  }
  return out;
}
