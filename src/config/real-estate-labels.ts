/**
 * Labels and badge tones for the Sales & leasing (real estate dealer) module.
 * Safe for server and client code; keep in sync with prisma/schema.prisma.
 */
import type {
  AreaUnit,
  DealStage,
  DealType,
  LeadActivityType,
  LeadSource,
  LeadStage,
  ListingPropertyType,
  ListingPurpose,
  ListingStatus,
  ViewingStatus,
} from "@/generated/prisma/enums";
import type { Tone } from "@/config/labels";

export const listingPurposeLabels: Record<ListingPurpose, string> = { SALE: "For sale", RENT: "For rent" };
export const listingPurposeTones: Record<ListingPurpose, Tone> = { SALE: "accent", RENT: "info" };

export const listingStatusLabels: Record<ListingStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  UNDER_OFFER: "Under offer",
  SOLD: "Sold",
  RENTED: "Rented",
  ARCHIVED: "Archived",
};
export const listingStatusTones: Record<ListingStatus, Tone> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  UNDER_OFFER: "warning",
  SOLD: "accent",
  RENTED: "info",
  ARCHIVED: "neutral",
};

export const listingPropertyTypeLabels: Record<ListingPropertyType, string> = {
  HOUSE: "House",
  APARTMENT: "Apartment / flat",
  PORTION: "Portion",
  ROOM: "Room",
  HOSTEL_BED: "Hostel bed",
  PLOT: "Plot",
  SHOP: "Shop",
  OFFICE: "Office",
  WAREHOUSE: "Warehouse",
  BUILDING: "Building",
  FARMHOUSE: "Farmhouse",
  OTHER: "Other",
};

export const areaUnitLabels: Record<AreaUnit, string> = {
  SQFT: "Sq. ft",
  SQM: "Sq. m",
  SQYD: "Sq. yd",
  MARLA: "Marla",
  KANAL: "Kanal",
};

/** Area units offered in forms. Marla/Kanal are Pakistani units, shown first for PKR organizations. */
export function areaUnitOptions(currency: string, current?: AreaUnit | null) {
  const pk = currency.toUpperCase() === "PKR";
  const order: AreaUnit[] = pk ? ["MARLA", "KANAL", "SQFT", "SQYD", "SQM"] : ["SQFT", "SQM", "SQYD"];
  if (current && !order.includes(current)) order.push(current);
  return order.map((value) => ({ value, label: areaUnitLabels[value] }));
}

export function formatArea(value: number | null | undefined, unit: AreaUnit | null | undefined) {
  if (value === null || value === undefined || !unit) return null;
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  return `${n} ${areaUnitLabels[unit]}`;
}

export const leadSourceLabels: Record<LeadSource, string> = {
  WEBSITE: "Website",
  WALK_IN: "Walk-in",
  PHONE: "Phone call",
  WHATSAPP: "WhatsApp",
  REFERRAL: "Referral",
  PORTAL: "Property portal",
  SOCIAL: "Social media",
  OTHER: "Other",
};

export const leadStageLabels: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  VIEWING: "Viewing",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};
export const leadStageTones: Record<LeadStage, Tone> = {
  NEW: "info",
  CONTACTED: "accent",
  VIEWING: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "neutral",
};

export const leadActivityTypeLabels: Record<LeadActivityType, string> = {
  NOTE: "Note",
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MEETING: "Meeting",
  STAGE_CHANGE: "Stage change",
};

export const viewingStatusLabels: Record<ViewingStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};
export const viewingStatusTones: Record<ViewingStatus, Tone> = {
  SCHEDULED: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
};

export const dealTypeLabels: Record<DealType, string> = { SALE: "Sale", RENT: "Rent" };
export const dealTypeTones: Record<DealType, Tone> = { SALE: "accent", RENT: "info" };

export const dealStageLabels: Record<DealStage, string> = {
  OPEN: "Open",
  AGREEMENT: "Agreement",
  CLOSED_WON: "Closed – won",
  CLOSED_LOST: "Closed – lost",
};
export const dealStageTones: Record<DealStage, Tone> = {
  OPEN: "info",
  AGREEMENT: "warning",
  CLOSED_WON: "success",
  CLOSED_LOST: "neutral",
};

/** Settings page where the module is switched on. */
export const DEALER_SETTINGS_HREF = "/settings/business";

/**
 * Short price for cards: Pakistani organizations read large amounts in
 * lakh / crore ("PKR 2.5 Crore"); others get the regular currency format.
 */
export function formatPriceShort(amount: number, currency: string, locale = "en") {
  if (currency.toUpperCase() === "PKR" && amount >= 100_000) {
    const trim = (n: number) => (Math.round(n * 100) / 100).toString();
    return amount >= 10_000_000 ? `PKR ${trim(amount / 10_000_000)} Crore` : `PKR ${trim(amount / 100_000)} Lakh`;
  }
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString(locale)}`;
  }
}

/** wa.me link for a phone number (local Pakistani 03xx numbers are converted to +92). */
export function whatsappHref(phone: string | null | undefined, text?: string) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (/^03\d{9}$/.test(digits)) digits = `92${digits.slice(1)}`;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
