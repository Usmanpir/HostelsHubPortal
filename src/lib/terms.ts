import type { BusinessType, PropertyKind, RentalMode } from "@/generated/prisma/enums";

/**
 * Business vocabulary. Hostel operators think in hostels, rooms, beds and
 * residents; landlords and property managers think in properties, units and
 * tenants. The data model is the same (Hostel ≈ property, Room ≈ unit,
 * Resident ≈ tenant, ResidentAssignment ≈ stay/lease) — only the words change.
 */
export type Terms = {
  property: string;
  properties: string;
  unit: string;
  units: string;
  bed: string;
  beds: string;
  resident: string;
  residents: string;
  checkIn: string;
  checkOut: string;
  stay: string;
  stays: string;
  /** Past tense, e.g. "Checked in" / "Moved in". */
  checkedIn: string;
  checkedOut: string;
};

const HOSTEL_TERMS: Terms = {
  property: "Hostel",
  properties: "Hostels",
  unit: "Room",
  units: "Rooms",
  bed: "Bed",
  beds: "Beds",
  resident: "Resident",
  residents: "Residents",
  checkIn: "Check in",
  checkOut: "Check out",
  stay: "Stay",
  stays: "Stays",
  checkedIn: "Checked in",
  checkedOut: "Checked out",
};

const PROPERTY_TERMS: Terms = {
  property: "Property",
  properties: "Properties",
  unit: "Unit",
  units: "Units",
  bed: "Bed",
  beds: "Beds",
  resident: "Tenant",
  residents: "Tenants",
  checkIn: "Move in",
  checkOut: "Move out",
  stay: "Lease",
  stays: "Leases",
  checkedIn: "Moved in",
  checkedOut: "Moved out",
};

export function termsFor(businessType: BusinessType | null | undefined): Terms {
  return !businessType || businessType === "HOSTELS" ? HOSTEL_TERMS : PROPERTY_TERMS;
}

/** Sidebar/tab label overrides for the i18n `nav` namespace. */
export function navLabelOverrides(businessType: BusinessType | null | undefined): Record<string, string> {
  if (!businessType || businessType === "HOSTELS") return {};
  return {
    hostels: "Properties",
    allHostels: "All properties",
    roomMap: "Unit map",
    roomsAndBeds: "Units",
    rooms: "Units",
    residents: "Tenants",
    allResidents: "All tenants",
    checkInOut: "Move in / out",
    checkIn: "Move in",
    checkOut: "Move out",
    history: "Leases",
  };
}

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
  HOSTEL: "Hostel / PG",
  HOUSE: "House",
  APARTMENT_BUILDING: "Apartment building",
  APARTMENT: "Apartment",
  COMMERCIAL: "Commercial (shops / offices)",
  PLOT: "Plot / land",
  OTHER: "Other",
};

export const RENTAL_MODE_LABELS: Record<RentalMode, string> = {
  BY_BED: "By bed (hostel / shared rooms)",
  WHOLE_UNIT: "Whole unit (one tenant per unit)",
};

/** Sensible default rental mode for a property kind. */
export function defaultRentalMode(kind: PropertyKind): RentalMode {
  return kind === "HOSTEL" ? "BY_BED" : "WHOLE_UNIT";
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  HOSTELS: "Hostels & PGs",
  PROPERTY_MANAGEMENT: "Rental property management",
  REAL_ESTATE: "Real estate agency",
  MIXED: "Mixed portfolio",
};
