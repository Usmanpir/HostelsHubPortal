import { z } from "zod";
import {
  dateSchema,
  moneySchema,
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalText,
  phoneSchema,
  positiveMoney,
  requiredText,
} from "./common";
import { CHARGE_TYPES, PAYMENT_METHODS } from "./finance";

export const RESIDENT_STATUSES = ["ACTIVE", "NOTICE", "CHECKED_OUT", "SUSPENDED", "ARCHIVED"] as const;
/** Statuses that can be set by hand; CHECKED_OUT / ARCHIVED come from workflows. */
export const EDITABLE_RESIDENT_STATUSES = ["ACTIVE", "NOTICE", "SUSPENDED"] as const;
export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export const RESIDENT_DOCUMENT_TYPES = ["ID_DOCUMENT", "PHOTO", "ADMISSION_FORM", "AGREEMENT", "CLEARANCE", "OTHER"] as const;
export const ASSIGNMENT_STATUSES = ["RESERVED", "ACTIVE", "TRANSFERRED", "COMPLETED", "CANCELLED"] as const;
export const REQUEST_TYPES = ["ROOM_CHANGE", "LEAVE", "OTHER"] as const;
export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

const optionalGender = z
  .union([z.literal("").transform(() => undefined), z.enum(GENDERS)])
  .optional();

// ─── Resident profile ───────────────────────────────────────────────────────

export const residentSchema = z
  .object({
    hostelId: z.string().min(1, "Select a hostel"),
    firstName: requiredText("First name", 80),
    lastName: requiredText("Last name", 80),
    email: optionalEmail,
    phone: phoneSchema,
    alternatePhone: optionalPhone,
    gender: optionalGender,
    dateOfBirth: optionalDate,
    idNumber: optionalText(40),
    nationality: optionalText(80),
    address: optionalText(300),
    city: optionalText(100),
    occupation: optionalText(120),
    institution: optionalText(160),
    joiningDate: dateSchema,
    expectedLeavingDate: optionalDate,
    emergencyContactName: optionalText(120),
    emergencyContactPhone: optionalPhone,
    emergencyContactRelation: optionalText(60),
    guardianName: optionalText(120),
    guardianPhone: optionalPhone,
    status: z.enum(EDITABLE_RESIDENT_STATUSES).default("ACTIVE"),
    notes: optionalText(2000),
    /** Stored file id from an upload with purpose "resident-photo". Empty = no photo. */
    photoFileId: optionalText(64),
  })
  .refine((v) => !v.expectedLeavingDate || v.expectedLeavingDate >= v.joiningDate, {
    message: "Expected leaving date must be after the joining date",
    path: ["expectedLeavingDate"],
  })
  .refine((v) => !v.dateOfBirth || v.dateOfBirth < new Date(), {
    message: "Date of birth must be in the past",
    path: ["dateOfBirth"],
  });
export type ResidentInput = z.input<typeof residentSchema>;
export type ResidentValues = z.output<typeof residentSchema>;

export const bulkResidentStatusSchema = z.object({
  residentIds: z.array(z.string().min(1)).min(1, "Select at least one resident").max(100),
  status: z.enum(EDITABLE_RESIDENT_STATUSES),
});
export type BulkResidentStatusInput = z.input<typeof bulkResidentStatusSchema>;

export const residentDocumentSchema = z.object({
  fileId: z.string().min(1, "Upload a file"),
  type: z.enum(RESIDENT_DOCUMENT_TYPES),
  title: requiredText("Title", 120),
});
export type ResidentDocumentInput = z.input<typeof residentDocumentSchema>;

// ─── Assignments ────────────────────────────────────────────────────────────

const optionalInt = (min: number, max: number) =>
  z.union([z.literal("").transform(() => undefined), z.coerce.number().int().min(min).max(max)]).optional().nullable();

/** Lease terms (whole-unit rentals; optional for beds). Empty strings from forms mean "not set". */
export const leaseFieldsSchema = z.object({
  leaseEndDate: optionalDate,
  noticePeriodDays: optionalInt(0, 365),
  advanceRent: z.union([z.literal("").transform(() => undefined), moneySchema]).optional().nullable(),
  rentIncrementPercent: z
    .union([z.literal("").transform(() => undefined), z.coerce.number().min(0, "Must be 0–100").max(100, "Must be 0–100")])
    .optional()
    .nullable(),
  incrementIntervalMonths: optionalInt(1, 120),
  leaseTerms: optionalText(5000),
});
export type LeaseFieldsInput = z.input<typeof leaseFieldsSchema>;

export const checkInSchema = leaseFieldsSchema.extend({
  residentId: z.string().min(1, "Select a resident"),
  bedId: z.string().min(1, "Select a bed"),
  checkInDate: dateSchema,
  monthlyRent: moneySchema,
  securityDeposit: moneySchema.default(0),
  notes: optionalText(1000),
  agreementFileId: optionalText(64),
  /** Hold the bed without moving the resident in yet. */
  reserveOnly: z.boolean().default(false),
  /** Create the first invoice (ignored without invoices.manage). */
  generateInvoice: z
    .object({
      includeRent: z.boolean().default(true),
      includeDeposit: z.boolean().default(true),
      includeAdmissionFee: z.boolean().default(false),
    })
    .optional(),
}).refine((v) => !v.leaseEndDate || !v.checkInDate || v.leaseEndDate >= v.checkInDate, {
  message: "Lease end must be on or after the move-in date",
  path: ["leaseEndDate"],
});
export type CheckInInput = z.input<typeof checkInSchema>;

export const renewLeaseSchema = z
  .object({
    assignmentId: z.string().min(1),
    leaseEndDate: dateSchema,
    /** Optional new monthly rent… */
    newMonthlyRent: z.union([z.literal("").transform(() => undefined), positiveMoney]).optional().nullable(),
    /** …effective from this date (defaults to today). A future date is applied by the daily job. */
    rentEffectiveDate: optionalDate,
    noticePeriodDays: optionalInt(0, 365),
    rentIncrementPercent: z
      .union([z.literal("").transform(() => undefined), z.coerce.number().min(0, "Must be 0–100").max(100, "Must be 0–100")])
      .optional()
      .nullable(),
    incrementIntervalMonths: optionalInt(1, 120),
    leaseTerms: optionalText(5000),
  })
  .refine((v) => !v.rentEffectiveDate || !!v.newMonthlyRent, {
    message: "Enter the new rent",
    path: ["newMonthlyRent"],
  });
export type RenewLeaseInput = z.input<typeof renewLeaseSchema>;

export const activateReservationSchema = z.object({
  assignmentId: z.string().min(1),
  checkInDate: dateSchema,
});
export type ActivateReservationInput = z.input<typeof activateReservationSchema>;

export const cancelReservationSchema = z.object({
  assignmentId: z.string().min(1),
  reason: optionalText(300),
});
export type CancelReservationInput = z.input<typeof cancelReservationSchema>;

export const transferSchema = z.object({
  residentId: z.string().min(1, "Select a resident"),
  toBedId: z.string().min(1, "Select the new bed"),
  transferDate: dateSchema,
  monthlyRent: moneySchema,
  notes: optionalText(1000),
});
export type TransferInput = z.input<typeof transferSchema>;

export const finalChargeSchema = z.object({
  type: z.enum(CHARGE_TYPES),
  description: requiredText("Description", 200),
  amount: positiveMoney,
});
export type FinalChargeInput = z.input<typeof finalChargeSchema>;

export const checkOutSchema = z.object({
  residentId: z.string().min(1, "Select a resident"),
  checkOutDate: dateSchema,
  finalCharges: z.array(finalChargeSchema).max(20).default([]),
  depositDeduction: moneySchema.default(0),
  depositRefund: moneySchema.default(0),
  refundMethod: z.enum(PAYMENT_METHODS).default("CASH"),
  meterReading: optionalText(60),
  endReason: optionalText(300),
  notes: optionalText(1000),
  clearanceFileId: optionalText(64),
});
export type CheckOutInput = z.input<typeof checkOutSchema>;

// ─── Requests ───────────────────────────────────────────────────────────────

export const requestDecisionSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"]),
    response: optionalText(1000),
  })
  .refine((v) => v.status !== "REJECTED" || !!v.response, {
    message: "Tell the resident why the request was rejected",
    path: ["response"],
  });
export type RequestDecisionInput = z.input<typeof requestDecisionSchema>;
