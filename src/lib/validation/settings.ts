import { z } from "zod";
import { BusinessType, NotificationType } from "@/generated/prisma/enums";
import { CURRENCIES, TIMEZONES } from "@/config/defaults";
import { isPermission, type Permission } from "@/lib/permissions/catalog";
import { emailSchema, optionalEmail, optionalPhone, optionalText, requiredText } from "./common";

/**
 * Settings module schemas — shared by client forms and services. Services
 * always re-parse (never trust input, even from our own forms).
 */

export const LOCALES = [{ code: "en", label: "English" }] as const;

const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];
const timezoneValues = [...TIMEZONES] as [string, ...string[]];
const localeCodes = LOCALES.map((l) => l.code) as [string, ...string[]];

// ─── Organization profile ───────────────────────────────────────────────────

export const organizationSettingsSchema = z.object({
  name: requiredText("Organization name", 120),
  email: optionalEmail,
  phone: optionalPhone,
  address: optionalText(300),
  city: optionalText(100),
  country: optionalText(100),
  currency: z.enum(currencyCodes, { message: "Select a currency" }),
  timezone: z.enum(timezoneValues, { message: "Select a time zone" }),
  locale: z.enum(localeCodes, { message: "Select a language" }).default("en"),
  /** `null` removes the logo, a new id attaches an uploaded file, the current id keeps it. */
  logoFileId: z.string().trim().max(64).nullable().optional(),
});
export type OrganizationSettingsInput = z.input<typeof organizationSettingsSchema>;

// ─── Business type & modules ────────────────────────────────────────────────

export const businessModulesSchema = z
  .object({
    businessType: z.enum(Object.values(BusinessType) as [BusinessType, ...BusinessType[]], {
      message: "Select a business type",
    }),
    ownersEnabled: z.boolean().default(false),
    dealerEnabled: z.boolean().default(false),
    /** Only meaningful with the dealer (sales & leasing) module; coerced off otherwise. */
    publicListingsEnabled: z.boolean().default(false),
    publicProfileIntro: optionalText(2000),
  })
  .transform((v) => ({ ...v, publicListingsEnabled: v.dealerEnabled && v.publicListingsEnabled }));
export type BusinessModulesInput = z.input<typeof businessModulesSchema>;

// ─── Branding (white-label) ─────────────────────────────────────────────────

export const HEX_COLOR = /^#[0-9a-f]{6}$/;
const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export const brandingSchema = z.object({
  brandName: optionalText(80),
  primaryColor: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HEX_COLOR, "Use a 6-digit hex colour, e.g. #4f46e5")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .pipe(z.string().regex(HOSTNAME, "Enter a domain like portal.example.com"))
    .optional()
    .or(z.literal("").transform(() => undefined)),
  emailSenderName: optionalText(80),
  emailSenderAddress: optionalEmail,
});
export type BrandingInput = z.input<typeof brandingSchema>;

// ─── Invoice settings ───────────────────────────────────────────────────────

const prefix = (label: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .min(1, `${label} is required`)
    .max(10, "Use at most 10 characters")
    .regex(/^[A-Z0-9-]+$/, "Use letters, numbers and dashes only");

export const invoiceSettingsSchema = z.object({
  invoicePrefix: prefix("Invoice prefix"),
  receiptPrefix: prefix("Receipt prefix"),
  invoiceDueDays: z.coerce
    .number({ message: "Enter a number of days" })
    .int("Use whole days")
    .min(0, "Cannot be negative")
    .max(365, "Use at most 365 days"),
  taxRate: z.coerce
    .number({ message: "Enter a tax rate" })
    .min(0, "Tax rate cannot be negative")
    .max(100, "Tax rate cannot exceed 100%")
    .transform((v) => Math.round(v * 100) / 100),
  taxLabel: optionalText(30),
  invoiceFooter: optionalText(1000),
});
export type InvoiceSettingsInput = z.input<typeof invoiceSettingsSchema>;

// ─── Notifications ──────────────────────────────────────────────────────────

export const NOTIFICATION_EVENTS = Object.values(NotificationType);

export const notificationEventLabels: Record<NotificationType, { label: string; description: string }> = {
  RENT_DUE: { label: "Rent due", description: "Reminders when rent invoices are due or overdue." },
  PAYMENT_RECEIVED: { label: "Payment received", description: "When a payment is recorded against an invoice." },
  INVOICE_CREATED: { label: "Invoice created", description: "When a new invoice is issued to a resident." },
  COMPLAINT_UPDATED: { label: "Complaint updates", description: "New complaints and status changes." },
  MAINTENANCE_UPDATED: { label: "Maintenance updates", description: "New requests, assignments and completions." },
  ROOM_ASSIGNED: { label: "Room assigned", description: "When a resident is allocated a bed." },
  ROOM_TRANSFER: { label: "Room transfer", description: "When a resident moves to another bed or room." },
  ANNOUNCEMENT: { label: "Announcements", description: "Notices published to residents or staff." },
  CHECK_IN: { label: "Check-in", description: "When a resident checks in." },
  CHECK_OUT: { label: "Check-out", description: "When a resident checks out." },
  REQUEST_UPDATED: { label: "Resident requests", description: "Room change and leave request decisions." },
  LEASE_EXPIRING: { label: "Lease expiry", description: "Reminders before a lease ends." },
  RENT_INCREASED: { label: "Rent increases", description: "Scheduled rent increments applied to a lease." },
  LEAD_RECEIVED: { label: "New leads", description: "Inquiries from the public listings page and new leads." },
  VIEWING_SCHEDULED: { label: "Viewings", description: "Property viewings scheduled or changed." },
  OWNER_PAYOUT: { label: "Owner payouts", description: "Owner statements and payouts." },
  SYSTEM: { label: "System messages", description: "Account, billing and security notices." },
};

export const notificationSettingsSchema = z.object({
  email: z.boolean().default(false),
  events: z
    .object(
      Object.fromEntries(NOTIFICATION_EVENTS.map((t) => [t, z.boolean().default(true)])) as Record<
        NotificationType,
        z.ZodDefault<z.ZodBoolean>
      >,
    )
    .default(Object.fromEntries(NOTIFICATION_EVENTS.map((t) => [t, true])) as Record<NotificationType, boolean>),
});
export type NotificationSettingsInput = z.input<typeof notificationSettingsSchema>;
export type NotificationSettings = z.output<typeof notificationSettingsSchema>;

// ─── Roles ──────────────────────────────────────────────────────────────────

/**
 * Permissions that administer the organization itself. Non-owners may only
 * grant these when they hold them, so "manage roles" can't be used to escalate
 * into billing or audit access.
 */
export const ADMIN_PERMISSIONS: readonly Permission[] = [
  "settings.organization",
  "settings.members",
  "settings.roles",
  "settings.billing",
  "audit.view",
];

const permissionList = z
  .array(z.string())
  .max(200)
  .transform((list, ctx): Permission[] => {
    const unknown = list.filter((p) => !isPermission(p));
    if (unknown.length) {
      ctx.addIssue({ code: "custom", message: `Unknown permission: ${unknown[0]}` });
      return z.NEVER;
    }
    return [...new Set(list)] as Permission[];
  });

export const roleSchema = z.object({
  name: requiredText("Role name", 60),
  description: optionalText(300),
  defaultAllHostels: z.boolean().default(false),
  permissions: permissionList.default([]),
});
export type RoleInput = z.input<typeof roleSchema>;

export const duplicateRoleSchema = z.object({
  name: requiredText("Role name", 60),
});
export type DuplicateRoleInput = z.input<typeof duplicateRoleSchema>;

// ─── Members & invitations ──────────────────────────────────────────────────

const hostelIdList = z.array(z.string().min(1).max(64)).max(500).default([]);

export const memberAccessSchema = z
  .object({
    allHostels: z.boolean().default(false),
    hostelIds: hostelIdList,
  })
  .refine((v) => v.allHostels || v.hostelIds.length > 0, {
    message: "Select at least one hostel or grant access to all hostels",
    path: ["hostelIds"],
  });
export type MemberAccessInput = z.input<typeof memberAccessSchema>;

export const memberRoleSchema = z.object({ roleId: z.string().min(1, "Select a role").max(64) });
export type MemberRoleInput = z.input<typeof memberRoleSchema>;

export const memberStatusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) });
export type MemberStatusInput = z.input<typeof memberStatusSchema>;

/** REST PATCH /api/members/[id] — any combination of role, access and status. */
export const memberUpdateSchema = z
  .object({
    roleId: z.string().min(1).max(64).optional(),
    allHostels: z.boolean().optional(),
    hostelIds: z.array(z.string().min(1).max(64)).max(500).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((v) => v.roleId !== undefined || v.allHostels !== undefined || v.hostelIds !== undefined || v.status !== undefined, {
    message: "Nothing to update",
  });
export type MemberUpdateInput = z.input<typeof memberUpdateSchema>;

/** Client-side mirror of `inviteSchema` in the invitation service. */
export const inviteMemberSchema = z
  .object({
    email: emailSchema,
    roleId: z.string().min(1, "Select a role"),
    allHostels: z.boolean().default(false),
    hostelIds: hostelIdList,
  })
  .refine((v) => v.allHostels || v.hostelIds.length > 0, {
    message: "Select at least one hostel or grant access to all hostels",
    path: ["hostelIds"],
  });
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

// ─── Subscription ───────────────────────────────────────────────────────────

export const changePlanSchema = z.object({
  planKey: z.string().trim().min(1, "Select a plan").max(64),
  interval: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
});
export type ChangePlanInput = z.input<typeof changePlanSchema>;
