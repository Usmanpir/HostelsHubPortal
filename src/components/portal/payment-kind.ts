import type { PaymentType } from "@/generated/prisma/enums";
import type { Tone } from "@/config/labels";

/**
 * Resident-friendly label for non-standard payment rows. Negative ADVANCE rows
 * are the bookkeeping side of applying credit to an invoice.
 */
export function paymentKindLabel(type: PaymentType, amount: number): { label: string; tone: Tone } | null {
  if (type === "ADVANCE") return amount < 0 ? { label: "Credit applied", tone: "info" } : { label: "Advance", tone: "accent" };
  if (type === "REFUND") return { label: "Refund to you", tone: "warning" };
  return null;
}

export function receiptTitle(type: PaymentType, amount: number) {
  if (type === "REFUND") return "Refund receipt";
  if (type === "ADVANCE" && amount < 0) return "Credit note";
  return "Payment receipt";
}
