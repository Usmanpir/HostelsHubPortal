import { z } from "zod";
import { idSchema, optionalEmail, optionalPhone, optionalText, requiredText } from "./common";
import { PAYMENT_METHODS } from "./finance";

/** Shared Zod schemas for the property-owner (landlord) module: forms (client) and services (server). */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD calendar date (date-only columns are stored at UTC midnight). */
export const isoDaySchema = z
  .string()
  .trim()
  .regex(ISO_DAY, "Enter a valid date")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00.000Z`).getTime()), "Enter a valid date");

export const percentSchema = z.coerce
  .number({ message: "Enter a percentage" })
  .min(0, "Cannot be negative")
  .max(100, "Cannot exceed 100%")
  .transform((v) => Math.round(v * 100) / 100);

export const ownerSchema = z.object({
  name: requiredText("Name", 150),
  phone: optionalPhone,
  email: optionalEmail,
  idNumber: optionalText(50),
  address: optionalText(300),
  bankName: optionalText(100),
  bankAccountTitle: optionalText(150),
  bankAccountNumber: optionalText(60),
  commissionPercent: percentSchema.default(0),
  notes: optionalText(2000),
});
export type OwnerInput = z.input<typeof ownerSchema>;
export type OwnerData = z.output<typeof ownerSchema>;

/** Replace the set of (accessible, active) properties linked to an owner. */
export const ownerPropertiesSchema = z.object({
  hostelIds: z.array(idSchema).max(500).transform((ids) => [...new Set(ids)]),
});
export type OwnerPropertiesInput = z.input<typeof ownerPropertiesSchema>;

/** Longest statement period we aggregate in one request. */
export const MAX_STATEMENT_DAYS = 366;

const DAY_MS = 86_400_000;

export function daySpan(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

type Period = { from: string; to: string };
const periodInOrder = (p: Period) => p.from <= p.to;
const periodInOrderError = { message: "The start date must be on or before the end date", path: ["to"] };
const periodWithinLimit = (p: Period) => daySpan(p.from, p.to) <= MAX_STATEMENT_DAYS;
const periodWithinLimitError = { message: `A statement can cover at most ${MAX_STATEMENT_DAYS} days`, path: ["to"] };

export const statementPeriodSchema = z
  .object({ from: isoDaySchema, to: isoDaySchema })
  .refine(periodInOrder, periodInOrderError)
  .refine(periodWithinLimit, periodWithinLimitError);
export type StatementPeriod = z.output<typeof statementPeriodSchema>;

const signedMoney = z.coerce
  .number({ message: "Enter an amount" })
  .min(-1_000_000_000)
  .max(1_000_000_000)
  .transform((v) => Math.round(v * 100) / 100);

export const createPayoutSchema = z
  .object({
    ownerId: idSchema,
    from: isoDaySchema,
    to: isoDaySchema,
    adjustments: z.union([z.literal("").transform(() => 0), signedMoney]).default(0),
    notes: optionalText(1000),
  })
  .refine(periodInOrder, periodInOrderError)
  .refine(periodWithinLimit, periodWithinLimitError)
  .refine((p) => p.adjustments === 0 || (p.notes?.length ?? 0) >= 3, {
    message: "Explain the adjustment in the notes",
    path: ["notes"],
  });
export type CreatePayoutInput = z.input<typeof createPayoutSchema>;

export const payPayoutSchema = z.object({
  paidAt: isoDaySchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: optionalText(100),
  notes: optionalText(1000),
});
export type PayPayoutInput = z.input<typeof payPayoutSchema>;

export const cancelPayoutSchema = z.object({
  reason: optionalText(500),
});
export type CancelPayoutInput = z.input<typeof cancelPayoutSchema>;

/** PATCH /api/owners/payouts/[id] body. */
export const payoutPatchSchema = z.discriminatedUnion("action", [
  payPayoutSchema.extend({ action: z.literal("pay") }),
  cancelPayoutSchema.extend({ action: z.literal("cancel") }),
]);
export type PayoutPatchInput = z.input<typeof payoutPatchSchema>;

export const OWNER_PAYOUT_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;
