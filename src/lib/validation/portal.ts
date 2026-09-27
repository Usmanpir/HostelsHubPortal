import { z } from "zod";
import { optionalPhone, optionalText, phoneSchema, requiredText } from "./common";

/**
 * Schemas for the resident portal. Residents never send their own
 * residentId / organizationId / hostelId — those always come from the
 * server-side ResidentContext.
 */

const MAINTENANCE_CATEGORIES = ["ELECTRICITY", "PLUMBING", "AC", "FURNITURE", "INTERNET", "CLEANING", "WATER", "OTHER"] as const;
const COMPLAINT_CATEGORIES = ["ROOM", "FOOD", "CLEANLINESS", "NOISE", "STAFF", "SECURITY", "BILLING", "FACILITIES", "OTHER"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const ROOM_TYPES = ["SINGLE", "DOUBLE", "TRIPLE", "FOUR_BED", "SHARED", "CUSTOM"] as const;
const REQUEST_TYPES = ["ROOM_CHANGE", "LEAVE", "OTHER"] as const;

export const PORTAL_MAINTENANCE_CATEGORIES = MAINTENANCE_CATEGORIES;
export const PORTAL_COMPLAINT_CATEGORIES = COMPLAINT_CATEGORIES;
export const PORTAL_PRIORITIES = PRIORITIES;
export const PORTAL_ROOM_TYPES = ROOM_TYPES;
export const PORTAL_REQUEST_TYPES = REQUEST_TYPES;
export const MAX_MAINTENANCE_PHOTOS = 5;

/** YYYY-MM-DD or empty. */
const optionalDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .optional()
  .or(z.literal("").transform(() => undefined));

// ─── Profile ────────────────────────────────────────────────────────────────

/** The only fields a resident may change about themselves. */
export const portalProfileSchema = z.object({
  phone: phoneSchema,
  alternatePhone: optionalPhone,
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalPhone,
  emergencyContactRelation: optionalText(60),
});
export type PortalProfileInput = z.input<typeof portalProfileSchema>;

// ─── Complaints ─────────────────────────────────────────────────────────────

export const portalComplaintSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES, { message: "Select a category" }),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  title: requiredText("Title", 150),
  description: z.string().trim().min(10, "Describe the problem in at least 10 characters").max(3000),
});
export type PortalComplaintInput = z.input<typeof portalComplaintSchema>;

// ─── Maintenance ────────────────────────────────────────────────────────────

export const portalMaintenanceSchema = z.object({
  category: z.enum(MAINTENANCE_CATEGORIES, { message: "Select a category" }),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  title: requiredText("Title", 150),
  description: optionalText(3000),
  photoFileIds: z
    .array(z.string().min(1).max(64))
    .max(MAX_MAINTENANCE_PHOTOS, `Attach up to ${MAX_MAINTENANCE_PHOTOS} photos`)
    .optional()
    .default([])
    .transform((list) => [...new Set(list)]),
});
export type PortalMaintenanceInput = z.input<typeof portalMaintenanceSchema>;

// ─── Requests ───────────────────────────────────────────────────────────────

export const portalRequestSchema = z
  .object({
    type: z.enum(REQUEST_TYPES, { message: "Select a request type" }),
    /** Required for OTHER; generated for room change / leave. */
    subject: optionalText(150),
    /** Reason / details. */
    details: optionalText(2000),
    preferredRoomType: z.enum(ROOM_TYPES).optional().or(z.literal("").transform(() => undefined)),
    startDate: optionalDay,
    endDate: optionalDay,
  })
  .superRefine((v, issue) => {
    if (v.type === "OTHER" && !v.subject) {
      issue.addIssue({ code: "custom", path: ["subject"], message: "Subject is required" });
    }
    if (!v.details || v.details.length < 5) {
      issue.addIssue({ code: "custom", path: ["details"], message: "Please give a short reason (at least 5 characters)" });
    }
    if (v.type === "LEAVE") {
      if (!v.startDate) issue.addIssue({ code: "custom", path: ["startDate"], message: "Start date is required" });
      if (!v.endDate) issue.addIssue({ code: "custom", path: ["endDate"], message: "End date is required" });
      if (v.startDate && v.endDate && v.endDate < v.startDate) {
        issue.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
      }
    }
  });
export type PortalRequestInput = z.input<typeof portalRequestSchema>;

// ─── List filters ───────────────────────────────────────────────────────────

export const portalListSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
});
export type PortalListInput = z.input<typeof portalListSchema>;

export const PORTAL_INVOICE_FILTERS = ["all", "unpaid", "paid"] as const;
export type PortalInvoiceFilter = (typeof PORTAL_INVOICE_FILTERS)[number];
