import type { AreaUnit, ListingPropertyType, ListingPurpose } from "@/generated/prisma/enums";
import { formatMoney, formatNumber } from "@/lib/format";

/** Labels and URL helpers for the public listings site (safe on server and client). */

export const PURPOSE_LABEL: Record<ListingPurpose, string> = { SALE: "For sale", RENT: "For rent" };

export const PROPERTY_TYPE_LABEL: Record<ListingPropertyType, string> = {
  HOUSE: "House",
  APARTMENT: "Apartment",
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

export const AREA_UNIT_LABEL: Record<AreaUnit, string> = {
  SQFT: "sq ft",
  SQM: "m²",
  SQYD: "sq yd",
  MARLA: "marla",
  KANAL: "kanal",
};

export function listingPhotoUrl(listingId: string, fileId: string) {
  return `/api/public/listings/${encodeURIComponent(listingId)}/photos/${encodeURIComponent(fileId)}`;
}

export function orgLogoUrl(orgSlug: string) {
  return `/api/public/orgs/${encodeURIComponent(orgSlug)}/logo`;
}

export function listingPath(orgSlug: string, listingSlug: string) {
  return `/l/${orgSlug}/${listingSlug}`;
}

export function appOrigin() {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function absoluteUrl(path: string) {
  const origin = appOrigin();
  return origin ? new URL(path, origin).toString() : path;
}

export function formatListingPrice(
  listing: { price: number; purpose: ListingPurpose },
  org: { currency: string; locale: string },
) {
  const amount = formatMoney(listing.price, org.currency, org.locale);
  return listing.purpose === "RENT" ? `${amount} / month` : amount;
}

export function formatArea(listing: { areaValue: number | null; areaUnit: AreaUnit | null }, locale = "en") {
  if (!listing.areaValue) return null;
  return `${formatNumber(listing.areaValue, locale)}${listing.areaUnit ? ` ${AREA_UNIT_LABEL[listing.areaUnit]}` : ""}`;
}

export function formatPlace(listing: { locality: string | null; city: string | null }) {
  return [listing.locality, listing.city].filter((s) => s && s.trim()).join(", ") || null;
}
