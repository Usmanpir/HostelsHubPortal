import { z } from "zod";
import { optionalPhone, optionalText, requiredText } from "./common";

/** Shared Zod schemas for maintenance, complaints, visitors and announcements. */

export const MAINTENANCE_CATEGORIES = ["ELECTRICITY", "PLUMBING", "AC", "FURNITURE", "INTERNET", "CLEANING", "WATER", "OTHER"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const MAINTENANCE_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "REJECTED"] as const;
export const COMPLAINT_CATEGORIES = ["ROOM", "FOOD", "CLEANLINESS", "NOISE", "STAFF", "SECURITY", "BILLING", "FACILITIES", "OTHER"] as const;
export const COMPLAINT_STATUSES = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const ANNOUNCEMENT_AUDIENCES = ["EVERYONE", "RESIDENTS", "STAFF", "SPECIFIC_RESIDENTS"] as const;
export const ANNOUNCEMENT_CATEGORIES = ["GENERAL", "RENT_REMINDER", "MAINTENANCE", "RULES", "EMERGENCY", "EVENT"] as const;

export type MaintenanceStatusValue = (typeof MAINTENANCE_STATUSES)[number];
export type ComplaintStatusValue = (typeof COMPLAINT_STATUSES)[number];

/** Status moves for managers (maintenance.manage). */
export const MAINTENANCE_MANAGER_TRANSITIONS: Record<MaintenanceStatusValue, MaintenanceStatusValue[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "REJECTED"],
  ASSIGNED: ["OPEN", "IN_PROGRESS", "COMPLETED", "REJECTED"],
  IN_PROGRESS: ["ASSIGNED", "COMPLETED", "REJECTED"],
  COMPLETED: ["IN_PROGRESS"],
  REJECTED: ["OPEN"],
};

/** Status moves for the assigned worker (maintenance.work). */
export const MAINTENANCE_WORKER_TRANSITIONS: Record<MaintenanceStatusValue, MaintenanceStatusValue[]> = {
  OPEN: [],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
};

/** Status moves for complaint managers (complaints.manage). */
export const COMPLAINT_MANAGER_TRANSITIONS: Record<ComplaintStatusValue, ComplaintStatusValue[]> = {
  OPEN: ["UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  UNDER_REVIEW: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["UNDER_REVIEW", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: ["OPEN"],
};

/** Assigned staff (My tasks) can progress and resolve, but not close or reopen. */
export const COMPLAINT_ASSIGNEE_TRANSITIONS: Record<ComplaintStatusValue, ComplaintStatusValue[]> = {
  OPEN: ["UNDER_REVIEW", "IN_PROGRESS", "RESOLVED"],
  UNDER_REVIEW: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: [],
  CLOSED: [],
};

const optionalId = optionalText(64);

const idList = (max: number) =>
  z
    .array(z.string().min(1).max(64))
    .max(max)
    .optional()
    .default([])
    .transform((list) => [...new Set(list)]);

/** YYYY-MM-DD, or empty. */
const optionalDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .optional()
  .or(z.literal("").transform(() => undefined));

// ─── Maintenance ────────────────────────────────────────────────────────────

export const maintenanceSchema = z.object({
  hostelId: z.string().min(1, "Select a hostel").max(64),
  roomId: optionalId,
  bedId: optionalId,
  residentId: optionalId,
  category: z.enum(MAINTENANCE_CATEGORIES, { message: "Select a category" }),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  title: requiredText("Title", 150),
  description: optionalText(3000),
  assignedStaffId: optionalId,
  photoFileIds: idList(10),
  /** Take the selected bed out of service while the issue is open (needs rooms.manage). */
  markBedMaintenance: z.boolean().default(false),
});
export type MaintenanceInput = z.input<typeof maintenanceSchema>;

export const maintenanceEditSchema = maintenanceSchema.pick({
  roomId: true,
  bedId: true,
  residentId: true,
  category: true,
  priority: true,
  title: true,
  description: true,
});
export type MaintenanceEditInput = z.input<typeof maintenanceEditSchema>;

export const maintenanceAssignSchema = z.object({
  /** Empty = unassign. */
  assignedStaffId: optionalId,
});
export type MaintenanceAssignInput = z.input<typeof maintenanceAssignSchema>;

export const maintenanceStatusSchema = z
  .object({
    status: z.enum(MAINTENANCE_STATUSES),
    notes: optionalText(3000),
    /** On completion/rejection: put a bed that was taken out of service back to Available. */
    releaseBed: z.boolean().default(false),
  })
  .refine((v) => v.status !== "REJECTED" || (v.notes?.length ?? 0) >= 3, {
    message: "Give a short reason for rejecting this request",
    path: ["notes"],
  });
export type MaintenanceStatusInput = z.input<typeof maintenanceStatusSchema>;

export const maintenancePhotosSchema = z.object({
  photoFileIds: z.array(z.string().min(1).max(64)).min(1, "Upload at least one photo").max(10),
});
export type MaintenancePhotosInput = z.input<typeof maintenancePhotosSchema>;

export const maintenanceFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.enum(MAINTENANCE_CATEGORIES).optional(),
  hostelId: z.string().max(64).optional(),
  assignedStaffId: z.string().max(64).optional(),
  sort: z.enum(["createdAt", "priority", "status", "requestNumber"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  /** "open" = not completed/rejected */
  state: z.enum(["open", "closed"]).optional(),
});
export type MaintenanceFilters = z.input<typeof maintenanceFiltersSchema>;

// ─── Complaints ─────────────────────────────────────────────────────────────

export const complaintSchema = z.object({
  hostelId: z.string().min(1, "Select a hostel").max(64),
  residentId: optionalId,
  category: z.enum(COMPLAINT_CATEGORIES, { message: "Select a category" }),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  title: requiredText("Title", 150),
  description: requiredText("Description", 3000),
  assignedStaffId: optionalId,
});
export type ComplaintInput = z.input<typeof complaintSchema>;

export const complaintEditSchema = complaintSchema.pick({
  residentId: true,
  category: true,
  priority: true,
  title: true,
  description: true,
});
export type ComplaintEditInput = z.input<typeof complaintEditSchema>;

export const complaintAssignSchema = z.object({ assignedStaffId: optionalId });
export type ComplaintAssignInput = z.input<typeof complaintAssignSchema>;

export const complaintStatusSchema = z
  .object({
    status: z.enum(COMPLAINT_STATUSES),
    resolution: optionalText(3000),
  })
  .refine((v) => v.status !== "RESOLVED" || (v.resolution?.length ?? 0) >= 3, {
    message: "Describe how the complaint was resolved",
    path: ["resolution"],
  });
export type ComplaintStatusInput = z.input<typeof complaintStatusSchema>;

export const complaintFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.enum(COMPLAINT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.enum(COMPLAINT_CATEGORIES).optional(),
  hostelId: z.string().max(64).optional(),
  sort: z.enum(["createdAt", "priority", "status", "complaintNumber"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  state: z.enum(["open", "closed"]).optional(),
});
export type ComplaintFilters = z.input<typeof complaintFiltersSchema>;

// ─── Visitors ───────────────────────────────────────────────────────────────

export const visitorCheckInSchema = z.object({
  hostelId: z.string().min(1, "Select a hostel").max(64),
  name: requiredText("Visitor name", 120),
  phone: optionalPhone,
  idNumber: optionalText(40),
  residentId: optionalId,
  purpose: optionalText(200),
  notes: optionalText(1000),
});
export type VisitorCheckInInput = z.input<typeof visitorCheckInSchema>;

export const visitorFiltersSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(100).optional(),
    hostelId: z.string().max(64).optional(),
    from: optionalDay,
    to: optionalDay,
    state: z.enum(["inside", "left"]).optional(),
  })
  .refine((v) => !v.from || !v.to || v.to >= v.from, { message: "End date must be after start date", path: ["to"] });
export type VisitorFilters = z.input<typeof visitorFiltersSchema>;

// ─── Announcements ──────────────────────────────────────────────────────────

export const announcementSchema = z
  .object({
    title: requiredText("Title", 150),
    body: requiredText("Message", 5000),
    category: z.enum(ANNOUNCEMENT_CATEGORIES).default("GENERAL"),
    audience: z.enum(ANNOUNCEMENT_AUDIENCES).default("EVERYONE"),
    /** Empty = entire organization. */
    hostelId: optionalId,
    residentIds: idList(500),
    isPinned: z.boolean().default(false),
    /** Publish date (org time zone). Empty or today = publish now. */
    publishDate: optionalDay,
    /** Last day the announcement is shown (org time zone). */
    expiryDate: optionalDay,
  })
  .refine((v) => v.audience !== "SPECIFIC_RESIDENTS" || v.residentIds.length > 0, {
    message: "Pick at least one resident",
    path: ["residentIds"],
  })
  .refine((v) => !v.publishDate || !v.expiryDate || v.expiryDate >= v.publishDate, {
    message: "Expiry must be on or after the publish date",
    path: ["expiryDate"],
  });
export type AnnouncementInput = z.input<typeof announcementSchema>;

export const announcementFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),
  /** active = published & not expired; scheduled = future; expired; archived */
  state: z.enum(["active", "scheduled", "expired", "archived"]).optional(),
});
export type AnnouncementFilters = z.input<typeof announcementFiltersSchema>;
