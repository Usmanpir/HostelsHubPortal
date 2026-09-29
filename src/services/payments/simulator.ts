import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import {
  GatewayVerificationError,
  type CallbackPayload,
  type CheckoutForm,
  type CheckoutRequest,
  type GatewayCredentials,
  type PaymentGatewayAdapter,
  type VerifiedResult,
} from "./types";

/**
 * Local-development payment "gateway". It renders /portal/payments/simulator
 * where the resident approves or declines; the page signs the chosen outcome
 * with a server-only HMAC key and posts it to the same return route real
 * gateways use, so the full completion path is exercised without merchant
 * accounts.
 *
 * Hard-disabled in production: `simulatorEnabled()` is false whenever
 * NODE_ENV === "production", regardless of PAYMENTS_SIMULATOR, and every
 * adapter entry point re-checks it.
 */

export type SimulatorOutcome = "approve" | "decline" | "cancel";

export function simulatorEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && env.PAYMENTS_SIMULATOR === "true";
}

function assertEnabled() {
  if (!simulatorEnabled()) throw new GatewayVerificationError("The payment simulator is disabled.");
}

function simulatorKey(): Buffer {
  const base = process.env.PAYMENTS_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!base) throw new GatewayVerificationError("Set AUTH_SECRET to use the payment simulator.");
  return Buffer.from(hkdfSync("sha256", base, Buffer.alloc(0), "hostel-saas/payment-simulator/v1", 32));
}

export function simulatorSignature(txnRef: string, outcome: SimulatorOutcome, amount: string, key: Buffer = simulatorKey()) {
  return createHmac("sha256", key).update(`${txnRef}|${outcome}|${amount}`).digest("hex");
}

/** Signed fields for the simulator page's Approve / Decline / Cancel forms. */
export function simulatorCallbackFields(txnRef: string, outcome: SimulatorOutcome, amount: number): Record<string, string> {
  assertEnabled();
  const amt = amount.toFixed(2);
  return { ref: txnRef, outcome, amount: amt, signature: simulatorSignature(txnRef, outcome, amt) };
}

function verify(payload: CallbackPayload): VerifiedResult {
  assertEnabled();
  const { ref, outcome, amount, signature } = payload;
  if (!ref || !amount || !signature || (outcome !== "approve" && outcome !== "decline" && outcome !== "cancel")) {
    throw new GatewayVerificationError("Malformed simulator callback.");
  }
  const expected = Buffer.from(simulatorSignature(ref, outcome, amount), "hex");
  const given = Buffer.from(signature, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new GatewayVerificationError("Invalid simulator signature.");
  }
  return {
    txnRef: ref,
    outcome: outcome === "approve" ? "SUCCEEDED" : outcome === "cancel" ? "CANCELLED" : "FAILED",
    amount: Number(amount),
    gatewayTxnId: outcome === "approve" ? `SIM-${ref.slice(-10)}` : null,
    responseCode: outcome === "approve" ? "000" : outcome === "cancel" ? "CANCELLED" : "DECLINED",
    responseMessage: outcome === "approve" ? "Approved by simulator" : outcome === "cancel" ? "Cancelled in simulator" : "Declined by simulator",
    verifiedBy: "signature",
    raw: { ref, outcome, amount },
  };
}

export const simulatorAdapter: PaymentGatewayAdapter = {
  provider: "SIMULATOR",
  label: "Test payment (simulator)",
  merchantIdLabel: "—",
  subMerchantIdLabel: null,
  subMerchantIdRequired: false,
  secretFields: [],
  supportsInquiry: false,

  isConfigured: () => simulatorEnabled(),

  buildCheckout(_creds: GatewayCredentials, request: CheckoutRequest): CheckoutForm {
    assertEnabled();
    const base = new URL(request.returnUrl);
    return { actionUrl: `${base.origin}/portal/payments/simulator`, method: "GET", fields: { ref: request.txnRef } };
  },

  extractTxnRef: (payload) => payload.ref || null,

  classifyReturn: (payload) => (payload.ref ? { kind: "result", txnRef: payload.ref } : null),

  async verifyCallback(_creds, payload, txn) {
    const result = verify(payload);
    if (result.txnRef !== txn.txnRef) throw new GatewayVerificationError("Reference mismatch.");
    return result;
  },

  async testConnection() {
    return simulatorEnabled()
      ? { ok: true, message: "Simulator is enabled for local development." }
      : { ok: false, message: "Simulator is disabled." };
  },
};
