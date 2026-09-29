import { z } from "zod";
import { optionalEmail, optionalPhone, optionalText, requiredText } from "./common";

/** Shared Zod schemas for listings, leads, viewings and deals (client forms + services). */

export const LISTING_PURPOSES = ["SALE", "RENT"] as const;
export const LISTING_STATUSES = ["DRAFT", "ACTIVE", "UNDER_OFFER", "SOLD", "RENTED", "ARCHIVED"] as const;
export const LISTING_PROPERTY_TYPES = [
  "HOUSE",
  "APARTMENT",
  "PORTION",
  "ROOM",
  "HOSTEL_BED",
  "PLOT",
  "SHOP",
  "OFFICE",
  "WAREHOUSE",
  "BUILDING",
  "FARMHOUSE",
  "OTHER",
] as const;
export const AREA_UNITS = ["SQFT", "SQM", "SQYD", "MARLA", "KANAL"] as const;
export const LEAD_SOURCES = ["WEBSITE", "WALK_IN", "PHONE", "WHATSAPP", "REFERRAL", "PORTAL", "SOCIAL", "OTHER"] as const;
export const LEAD_STAGES = ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION", "WON", "LOST"] as const;
export const OPEN_LEAD_STAGES = ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION"] as const;
/** Activity types a user can log by hand (stage changes are logged automatically). */
export const MANUAL_ACTIVITY_TYPES = ["NOTE", "CALL", "WHATSAPP", "EMAIL", "MEETING"] as const;
export const VIEWING_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export const VIEWING_OUTCOMES = ["COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export const DEAL_TYPES = ["SALE", "RENT"] as const;
export const DEAL_STAGES = ["OPEN", "AGREEMENT", "CLOSED_WON", "CLOSED_LOST"] as const;
export const OPEN_DEAL_STAGES = ["OPEN", "AGREEMENT"] as const;

export type ListingStatusValue = (typeof LISTING_STATUSES)[number];
export type ListingPurposeValue = (typeof LISTING_PURPOSES)[number];
export type LeadStageValue = (typeof LEAD_STAGES)[number];
export type DealStageValue = (typeof DEAL_STAGES)[number];

/** Listing statuses that may be shown on the public listings site. */
export const PUBLISHABLE_LISTING_STATUSES: readonly ListingStatusValue[] = ["ACTIVE", "UNDER_OFFER"];

/**
 * Listing status workflow: DRAFT → ACTIVE → UNDER_OFFER → SOLD / RENTED, plus
 * ARCHIVED from anywhere. SOLD applies to sale listings, RENTED to rentals
 * (enforced by `listingTransitions`). A rented unit can be re-listed.
 */
const LISTING_TRANSITIONS: Record<ListingStatusValue, ListingStatusValue[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["UNDER_OFFER", "SOLD", "RENTED", "DRAFT", "ARCHIVED"],
  UNDER_OFFER: ["ACTIVE", "SOLD", "RENTED", "ARCHIVED"],
  SOLD: ["ARCHIVED"],
  RENTED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export function listingTransitions(status: ListingStatusValue, purpose: ListingPurposeValue): ListingStatusValue[] {
  return LISTING_TRANSITIONS[status].filter((s) => (purpose === "SALE" ? s !== "RENTED" : s !== "SOLD"));
}

/** Deal stage moves. A won deal is final (it has already updated the lead and listing). */
export const DEAL_TRANSITIONS: Record<DealStageValue, DealStageValue[]> = {
  OPEN: ["AGREEMENT", "CLOSED_WON", "CLOSED_LOST"],
  AGREEMENT: ["OPEN", "CLOSED_WON", "CLOSED_LOST"],
  CLOSED_WON: [],
  CLOSED_LOST: ["OPEN"],
};

/** Default commission for an agreed amount and percentage, rounded to 2 decimals. */
export function computeCommission(amount: number, percent: number) {
  if (!Number.isFinite(amount) || !Number.isFinite(percent)) return 0;
  return Math.round(amount * percent + Number.EPSILON) / 100;
}

/** Digits only, for wa.me links and duplicate matching (leading 0 → Pakistan +92 when `pkDefault`). */
export function phoneDigits(phone: string | null | undefined, pkDefault = false) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (pkDefault && /^03\d{9}$/.test(digits)) return `92${digits.slice(1)}`;
  return digits;
}

// ─── Building blocks ────────────────────────────────────────────────────────

const optionalId = optionalText(64);

/** Large amounts (property prices) — Decimal(14,2). */
const bigMoney = z.coerce
  .number({ message: "Enter an amount" })
  .min(0, "Amount cannot be negative")
  .max(999_999_999_999, "Amount is too large")
  .transform((v) => Math.round(v * 100) / 100);

const optionalBigMoney = z
  .union([z.literal("").transform(() => undefined), bigMoney])
  .optional()
  .nullable();

const optionalCount = z
  .union([z.literal("").transform(() => undefined), z.coerce.number().int("Enter a whole number").min(0).max(100)])
  .optional()
  .nullable();

const optionalArea = z
  .union([z.literal("").transform(() => undefined), z.coerce.number().positive("Area must be greater than zero").max(99_999_999)])
  .optional()
  .nullable();

const percent = z.coerce
  .number({ message: "Enter a percentage" })
  .min(0, "Can't be negative")
  .max(100, "At most 100%")
  .transform((v) => Math.round(v * 100) / 100);

/** YYYY-MM-DD */
const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const optionalDay = day.optional().or(z.literal("").transform(() => undefined));

const features = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) => {
    const list = Array.isArray(v) ? v : (v ?? "").split(",");
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const f = raw.trim().slice(0, 60);
      if (!f || seen.has(f.toLowerCase())) continue;
      seen.add(f.toLowerCase());
      out.push(f);
    }
    return out.slice(0, 40);
  });

const idList = (max: number) =>
  z
    .array(z.string().min(1).max(64))
    .max(max, `At most ${max} files at a time`)
    .transform((list) => [...new Set(list)]);

const flag = z
  .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
  .optional()
  .transform((v) => v === true || v === "1" || v === "true");

const listFilterBase = {
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  dir: z.enum(["asc", "desc"]).optional(),
};

// ─── Listings ───────────────────────────────────────────────────────────────

export const listingSchema = z
  .object({
    title: requiredText("Title", 150),
    purpose: z.enum(LISTING_PURPOSES, { message: "Select sale or rent" }),
    propertyType: z.enum(LISTING_PROPERTY_TYPES, { message: "Select a property type" }),
    price: bigMoney.refine((v) => v > 0, "Price must be greater than zero"),
    priceNegotiable: z.boolean().default(false),
    areaValue: optionalArea,
    areaUnit: z.enum(AREA_UNITS).optional().or(z.literal("").transform(() => undefined)),
    bedrooms: optionalCount,
    bathrooms: optionalCount,
    furnished: z.boolean().default(false),
    address: optionalText(300),
    locality: optionalText(120),
    city: optionalText(100),
    description: optionalText(5000),
    features,
    hostelId: optionalId,
    roomId: optionalId,
    ownerId: optionalId,
    agentUserId: optionalId,
  })
  .superRefine((v, ctx) => {
    if (v.areaValue != null && !v.areaUnit) {
      ctx.addIssue({ code: "custom", path: ["areaUnit"], message: "Select the area unit" });
    }
    if (v.roomId && !v.hostelId) {
      ctx.addIssue({ code: "custom", path: ["hostelId"], message: "Select the property this unit belongs to" });
    }
  });
export type ListingInput = z.input<typeof listingSchema>;
export type ListingValues = z.output<typeof listingSchema>;

export const listingStatusSchema = z.object({ status: z.enum(LISTING_STATUSES) });
export type ListingStatusInput = z.input<typeof listingStatusSchema>;

export const listingPublishSchema = z.object({ published: z.boolean() });
export type ListingPublishInput = z.input<typeof listingPublishSchema>;

export const listingPhotosSchema = z.object({ photoFileIds: idList(20).refine((l) => l.length > 0, "Add at least one photo") });
export type ListingPhotosInput = z.input<typeof listingPhotosSchema>;

export const listingCoverSchema = z.object({ fileId: z.string().min(1).max(64) });
export type ListingCoverInput = z.input<typeof listingCoverSchema>;

export const LISTING_SORTS = ["createdAt", "price", "title", "code", "status"] as const;

export const listingFiltersSchema = z
  .object({
    ...listFilterBase,
    purpose: z.enum(LISTING_PURPOSES).optional().catch(undefined),
    status: z.enum(LISTING_STATUSES).optional().catch(undefined),
    propertyType: z.enum(LISTING_PROPERTY_TYPES).optional().catch(undefined),
    city: z.string().trim().max(100).optional(),
    agentUserId: z.string().max(64).optional(),
    minPrice: z.coerce.number().min(0).optional().catch(undefined),
    maxPrice: z.coerce.number().min(0).optional().catch(undefined),
    sort: z.enum(LISTING_SORTS).optional().catch(undefined),
  });
export type ListingFilters = z.input<typeof listingFiltersSchema>;

// ─── Leads ──────────────────────────────────────────────────────────────────

export const leadSchema = z
  .object({
    name: requiredText("Name", 120),
    phone: optionalPhone,
    email: optionalEmail,
    source: z.enum(LEAD_SOURCES).default("OTHER"),
    interest: z.enum(LISTING_PURPOSES).optional().or(z.literal("").transform(() => undefined)),
    listingId: optionalId,
    budgetMin: optionalBigMoney,
    budgetMax: optionalBigMoney,
    preferredLocation: optionalText(200),
    message: optionalText(2000),
    notes: optionalText(2000),
    assignedUserId: optionalId,
    nextFollowUpAt: optionalDay,
  })
  .superRefine((v, ctx) => {
    if (!v.phone && !v.email) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Add a phone number or an email address" });
    }
    if (v.budgetMin != null && v.budgetMax != null && v.budgetMax < v.budgetMin) {
      ctx.addIssue({ code: "custom", path: ["budgetMax"], message: "Maximum budget must be at least the minimum" });
    }
  });
export type LeadInput = z.input<typeof leadSchema>;

export const leadStageSchema = z
  .object({
    stage: z.enum(LEAD_STAGES),
    lostReason: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.stage === "LOST" && (!v.lostReason || v.lostReason.length < 3)) {
      ctx.addIssue({ code: "custom", path: ["lostReason"], message: "Tell us why the lead was lost" });
    }
  });
export type LeadStageInput = z.input<typeof leadStageSchema>;

export const leadAssignSchema = z.object({ assignedUserId: optionalId });
export type LeadAssignInput = z.input<typeof leadAssignSchema>;

export const leadFollowUpSchema = z.object({ nextFollowUpAt: optionalDay });
export type LeadFollowUpInput = z.input<typeof leadFollowUpSchema>;

export const leadActivitySchema = z.object({
  type: z.enum(MANUAL_ACTIVITY_TYPES).default("NOTE"),
  body: requiredText("Details", 2000),
});
export type LeadActivityInput = z.input<typeof leadActivitySchema>;

export const leadDuplicateSchema = z.object({
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(254).optional(),
  excludeId: z.string().max(64).optional(),
});
export type LeadDuplicateInput = z.input<typeof leadDuplicateSchema>;

export const LEAD_SORTS = ["createdAt", "name", "code", "stage", "nextFollowUpAt"] as const;

export const leadFiltersSchema = z
  .object({
    ...listFilterBase,
    stage: z.enum(LEAD_STAGES).optional().catch(undefined),
    source: z.enum(LEAD_SOURCES).optional().catch(undefined),
    state: z.enum(["open", "closed"]).optional().catch(undefined),
    mine: flag,
    followUp: z.enum(["today", "overdue", "due"]).optional().catch(undefined),
    assignedUserId: z.string().max(64).optional(),
    listingId: z.string().max(64).optional(),
    sort: z.enum(LEAD_SORTS).optional().catch(undefined),
  });
export type LeadFilters = z.input<typeof leadFiltersSchema>;

// ─── Viewings ───────────────────────────────────────────────────────────────

export const viewingSchema = z.object({
  leadId: z.string().min(1, "Select a lead").max(64),
  listingId: z.string().min(1, "Select a listing").max(64),
  agentUserId: optionalId,
  date: day,
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time"),
});
export type ViewingInput = z.input<typeof viewingSchema>;

export const viewingRescheduleSchema = z.object({
  agentUserId: optionalId,
  date: day,
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time"),
});
export type ViewingRescheduleInput = z.input<typeof viewingRescheduleSchema>;

export const viewingOutcomeSchema = z.object({
  status: z.enum(VIEWING_OUTCOMES),
  feedback: optionalText(2000),
});
export type ViewingOutcomeInput = z.input<typeof viewingOutcomeSchema>;

export const viewingFiltersSchema = z.object({
  leadId: z.string().max(64).optional(),
  listingId: z.string().max(64).optional(),
  agentUserId: z.string().max(64).optional(),
  status: z.enum(VIEWING_STATUSES).optional().catch(undefined),
  mine: flag,
});
export type ViewingFilters = z.input<typeof viewingFiltersSchema>;

// ─── Deals ──────────────────────────────────────────────────────────────────

export const dealSchema = z.object({
  type: z.enum(DEAL_TYPES, { message: "Select sale or rent" }),
  listingId: optionalId,
  leadId: optionalId,
  clientName: requiredText("Client name", 120),
  agreedAmount: bigMoney.refine((v) => v > 0, "Amount must be greater than zero"),
  commissionPercent: percent.default(0),
  /** Leave empty to use agreed amount × commission %. */
  commissionAmount: optionalBigMoney,
  agentUserId: optionalId,
  expectedCloseDate: optionalDay,
  notes: optionalText(2000),
});
export type DealInput = z.input<typeof dealSchema>;

export const dealStageSchema = z.object({
  stage: z.enum(DEAL_STAGES),
  note: optionalText(500),
});
export type DealStageInput = z.input<typeof dealStageSchema>;

export const dealCommissionSchema = z.object({
  paid: z.boolean(),
  paidOn: optionalDay,
});
export type DealCommissionInput = z.input<typeof dealCommissionSchema>;

export const DEAL_SORTS = ["createdAt", "agreedAmount", "code", "stage", "expectedCloseDate"] as const;

export const dealFiltersSchema = z
  .object({
    ...listFilterBase,
    stage: z.enum(DEAL_STAGES).optional().catch(undefined),
    type: z.enum(DEAL_TYPES).optional().catch(undefined),
    state: z.enum(["open", "closed"]).optional().catch(undefined),
    commission: z.enum(["paid", "unpaid"]).optional().catch(undefined),
    mine: flag,
    agentUserId: z.string().max(64).optional(),
    sort: z.enum(DEAL_SORTS).optional().catch(undefined),
  });
export type DealFilters = z.input<typeof dealFiltersSchema>;

// ─── Time zone helpers (org-local date + time ↔ UTC instant) ────────────────

function zoneOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of wall-clock `ymd` + `hhmm` in `timeZone` (DST-safe). */
export function zonedTimeToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, h, mi);
  const first = zoneOffsetMs(new Date(naive), timeZone);
  const second = zoneOffsetMs(new Date(naive - first), timeZone);
  return new Date(naive - second);
}

/** `{ date: "YYYY-MM-DD", time: "HH:mm" }` of an instant in `timeZone`. */
export function localPartsInZone(instant: Date | string, timeZone: string) {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
