import { z } from "zod";
import { dateSchema, moneySchema, optionalDate, optionalText, positiveMoney, requiredText } from "./common";

export const CHARGE_TYPES = [
  "MONTHLY_RENT",
  "SECURITY_DEPOSIT",
  "ADMISSION_FEE",
  "ELECTRICITY",
  "GAS",
  "INTERNET",
  "MESS",
  "LAUNDRY",
  "MAINTENANCE",
  "LATE_FEE",
  "OTHER",
] as const;

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "ONLINE", "OTHER"] as const;
export const INVOICE_STATUSES = ["DRAFT", "PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"] as const;

export const invoiceItemSchema = z.object({
  type: z.enum(CHARGE_TYPES),
  description: requiredText("Description", 200),
  quantity: z.coerce.number().min(0.01, "Quantity must be positive").max(10000).default(1),
  unitPrice: moneySchema,
});
export type InvoiceItemInput = z.input<typeof invoiceItemSchema>;

export const invoiceSchema = z
  .object({
    residentId: z.string().min(1, "Select a resident"),
    assignmentId: optionalText(64),
    issueDate: dateSchema,
    dueDate: optionalDate,
    periodStart: optionalDate,
    periodEnd: optionalDate,
    items: z.array(invoiceItemSchema).min(1, "Add at least one line item").max(50),
    discount: moneySchema.default(0),
    applyTax: z.boolean().default(true),
    notes: optionalText(1000),
    /** DRAFT invoices are not sent to the resident and don't count as receivable. */
    status: z.enum(["DRAFT", "PENDING"]).default("PENDING"),
  })
  .refine((v) => !v.periodStart || !v.periodEnd || v.periodEnd >= v.periodStart, {
    message: "Period end must be after period start",
    path: ["periodEnd"],
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.issueDate, {
    message: "Due date cannot be before the issue date",
    path: ["dueDate"],
  });
export type InvoiceInput = z.input<typeof invoiceSchema>;

export const paymentSchema = z.object({
  residentId: z.string().min(1, "Select a resident"),
  /** Omit to record an advance / credit on the resident's account. */
  invoiceId: optionalText(64),
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  paymentDate: dateSchema,
  notes: optionalText(500),
  /** Explicit opt-in: amount above the invoice balance is kept as advance credit. */
  recordExcessAsAdvance: z.boolean().default(false),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const refundSchema = z.object({
  residentId: z.string().min(1),
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  paymentDate: dateSchema,
  notes: optionalText(500),
});
export type RefundInput = z.input<typeof refundSchema>;

export const voidSchema = z.object({ reason: requiredText("Reason", 500).refine((v) => v.length >= 3, "Give a short reason") });
