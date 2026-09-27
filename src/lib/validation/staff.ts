import { z } from "zod";
import {
  dateSchema,
  moneySchema,
  optionalDate,
  optionalEmail,
  optionalText,
  phoneSchema,
  requiredText,
} from "./common";

export const STAFF_TYPES = [
  "MANAGER",
  "WARDEN",
  "RECEPTIONIST",
  "SECURITY_GUARD",
  "CLEANER",
  "COOK",
  "MAINTENANCE",
  "ACCOUNTANT",
  "OTHER",
] as const;
export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"] as const;
export const STAFF_STATUSES = ["ACTIVE", "ON_LEAVE", "TERMINATED", "RESIGNED"] as const;
export const STAFF_DOCUMENT_TYPES = ["ID_DOCUMENT", "PHOTO", "CONTRACT", "CERTIFICATE", "OTHER"] as const;
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE", "HALF_DAY"] as const;
export const LEAVE_TYPES = ["CASUAL", "SICK", "ANNUAL", "UNPAID", "OTHER"] as const;
export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const PAYROLL_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;
export const STAFF_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "ONLINE", "OTHER"] as const;

/** Statuses that count as "employed" (plan limits, attendance sheet, payroll generation). */
export const EMPLOYED_STATUSES = ["ACTIVE", "ON_LEAVE"] as const;

const optionalId = optionalText(64);

// ─── Staff ──────────────────────────────────────────────────────────────────

export const staffSchema = z
  .object({
    firstName: requiredText("First name", 80),
    lastName: requiredText("Last name", 80),
    phone: phoneSchema,
    email: optionalEmail,
    idNumber: optionalText(40),
    address: optionalText(300),
    dateOfBirth: optionalDate,
    joiningDate: dateSchema,
    designation: z.enum(STAFF_TYPES).default("OTHER"),
    department: optionalText(80),
    employmentType: z.enum(EMPLOYMENT_TYPES).default("FULL_TIME"),
    status: z.enum(STAFF_STATUSES).default("ACTIVE"),
    salary: moneySchema.default(0),
    notes: optionalText(2000),
    hostelIds: z
      .array(z.string().min(1).max(64))
      .min(1, "Assign at least one hostel")
      .max(100)
      .transform((ids) => [...new Set(ids)]),
    primaryHostelId: optionalId,
    /** Organization member (user id) whose account is this employee. */
    userId: optionalId,
    /** Newly uploaded photo (purpose "staff-photo"). */
    photoFileId: optionalId,
    removePhoto: z.boolean().default(false),
  })
  .refine((v) => !v.primaryHostelId || v.hostelIds.includes(v.primaryHostelId), {
    message: "The primary hostel must be one of the assigned hostels",
    path: ["primaryHostelId"],
  })
  .refine((v) => !v.dateOfBirth || v.dateOfBirth < v.joiningDate, {
    message: "Date of birth must be before the joining date",
    path: ["dateOfBirth"],
  });
export type StaffInput = z.input<typeof staffSchema>;
export type StaffParsed = z.output<typeof staffSchema>;

export const archiveStaffSchema = z.object({
  status: z.enum(["TERMINATED", "RESIGNED"]).default("RESIGNED"),
});
export type ArchiveStaffInput = z.input<typeof archiveStaffSchema>;

export const staffDocumentSchema = z.object({
  fileId: z.string().min(1, "Upload a file").max(64),
  type: z.enum(STAFF_DOCUMENT_TYPES),
  title: requiredText("Title", 120),
});
export type StaffDocumentInput = z.input<typeof staffDocumentSchema>;

// ─── Attendance ─────────────────────────────────────────────────────────────

const timeOfDay = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)")
  .optional()
  .or(z.literal("").transform(() => undefined))
  .nullable()
  .transform((v) => v ?? undefined);

export const attendanceEntrySchema = z.object({
  staffId: z.string().min(1).max(64),
  status: z.enum(ATTENDANCE_STATUSES),
  checkInTime: timeOfDay,
  checkOutTime: timeOfDay,
  notes: optionalText(300).nullable().transform((v) => v ?? undefined),
});

export const attendanceBatchSchema = z.object({
  date: dateSchema,
  /** Hostel the attendance was taken at (optional; defaults to the staff member's primary hostel). */
  hostelId: optionalId,
  entries: z.array(attendanceEntrySchema).min(1, "Mark at least one staff member").max(1000),
});
export type AttendanceBatchInput = z.input<typeof attendanceBatchSchema>;
export type AttendanceEntryInput = z.input<typeof attendanceEntrySchema>;

// ─── Leave ──────────────────────────────────────────────────────────────────

export const leaveSchema = z
  .object({
    staffId: z.string().min(1, "Select a staff member").max(64),
    type: z.enum(LEAVE_TYPES),
    startDate: dateSchema,
    endDate: dateSchema,
    reason: optionalText(1000),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "End date cannot be before the start date", path: ["endDate"] })
  .refine((v) => v.endDate.getTime() - v.startDate.getTime() <= 366 * 86400_000, {
    message: "Leave cannot be longer than a year",
    path: ["endDate"],
  });
export type LeaveInput = z.input<typeof leaveSchema>;

export const leaveReviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
});
export type LeaveReviewInput = z.input<typeof leaveReviewSchema>;

// ─── Payroll ────────────────────────────────────────────────────────────────

export const periodSchema = z.object({
  year: z.coerce.number().int().min(2000, "Enter a valid year").max(2100, "Enter a valid year"),
  month: z.coerce.number().int().min(1, "Enter a valid month").max(12, "Enter a valid month"),
});

export const payrollGenerateSchema = periodSchema.extend({
  /** Limit generation to staff of one hostel (must be accessible). */
  hostelId: optionalId,
});
export type PayrollGenerateInput = z.input<typeof payrollGenerateSchema>;

export const payrollComponentsSchema = z.object({
  baseSalary: moneySchema,
  allowances: moneySchema.default(0),
  bonus: moneySchema.default(0),
  deductions: moneySchema.default(0),
  advances: moneySchema.default(0),
  notes: optionalText(1000),
});
export type PayrollComponentsInput = z.input<typeof payrollComponentsSchema>;

export const payrollPaySchema = z.object({
  paymentDate: dateSchema,
  paymentMethod: z.enum(STAFF_PAYMENT_METHODS),
  reference: optionalText(120),
  notes: optionalText(1000),
});
export type PayrollPayInput = z.input<typeof payrollPaySchema>;

// ─── Month helpers (shared by pages, routes and services) ───────────────────

/** Parse "YYYY-MM" into { year, month }; returns null when malformed. */
export function parseMonthKey(value: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Shift a month by `delta` months. */
export function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse "YYYY-MM-DD" strictly; returns null when malformed. */
export function parseDateKey(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}
