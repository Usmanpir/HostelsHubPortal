import type { BusinessType, PropertyKind, RentalMode, RoomType } from "@/generated/prisma/enums";
import { termsFor, type Terms } from "@/lib/terms";

/** One-line descriptions for the "What do you manage?" cards. */
export const BUSINESS_TYPE_DESCRIPTIONS: Record<BusinessType, string> = {
  HOSTELS: "Hostels, PGs and shared rooms rented out bed by bed.",
  PROPERTY_MANAGEMENT: "Houses, apartments, shops and offices rented to tenants.",
  REAL_ESTATE: "Listings, leads and deals for buying, selling and renting.",
  MIXED: "A bit of everything: hostels, rentals and real-estate deals.",
};

/** Business types that usually manage properties for other owners. */
export function suggestsOwners(businessType: BusinessType) {
  return businessType === "PROPERTY_MANAGEMENT" || businessType === "MIXED";
}

/** Property kind suggested for the first property of each business. */
export function defaultPropertyKind(businessType: BusinessType | null | undefined): PropertyKind {
  switch (businessType) {
    case "PROPERTY_MANAGEMENT":
    case "MIXED":
      return "APARTMENT_BUILDING";
    case "REAL_ESTATE":
      return "HOUSE";
    default:
      return "HOSTEL";
  }
}

/** Unit type suggested when generating whole units for a property kind. */
export function defaultUnitType(kind: PropertyKind | null | undefined): RoomType {
  switch (kind) {
    case "HOUSE":
      return "HOUSE";
    case "COMMERCIAL":
      return "SHOP";
    case "PLOT":
      return "WAREHOUSE";
    default:
      return "APARTMENT";
  }
}

export type WizardVocabulary = Terms & {
  /** Hostel-style org: keep the original hostel wording everywhere. */
  isHostelOrg: boolean;
  /** The first property is rented as whole units (one tenant, one bed per unit). */
  wholeUnit: boolean;
};

export function wizardVocabulary(businessType: BusinessType | null | undefined, rentalMode: RentalMode | null | undefined): WizardVocabulary {
  const terms = termsFor(businessType);
  const wholeUnit = rentalMode === "WHOLE_UNIT";
  return {
    ...terms,
    // Whole units are always "units", even for a hostel business.
    ...(wholeUnit ? { unit: "Unit", units: "Units" } : null),
    isHostelOrg: !businessType || businessType === "HOSTELS",
    wholeUnit,
  };
}
