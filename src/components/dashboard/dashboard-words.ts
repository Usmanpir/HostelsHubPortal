import type { BusinessType } from "@/generated/prisma/enums";
import { termsFor, type Terms } from "@/lib/terms";

/**
 * Dashboard wording in the organization's vocabulary. Hostels count capacity
 * in beds; property organizations count it in units. Hostel wording is kept
 * exactly as it has always been.
 */
export function dashboardWords(businessType: BusinessType | null | undefined) {
  const t: Terms = termsFor(businessType);
  const isHostel = !businessType || businessType === "HOSTELS";
  const lower = (s: string) => s.toLowerCase();
  return {
    t,
    isHostel,
    /** Capacity noun, plural lower-case: "beds" / "units". */
    capacity: lower(isHostel ? t.beds : t.units),
    /** Capacity noun, singular lower-case: "bed" / "unit". */
    capacityOne: lower(isHostel ? t.bed : t.unit),
    property: lower(t.property),
    properties: lower(t.properties),
    units: lower(t.units),
    resident: lower(t.resident),
    residents: lower(t.residents),
    /** "check-in" / "move-in". */
    checkInNoun: lower(t.checkIn).replace(" ", "-"),
  };
}

export type DashboardWords = ReturnType<typeof dashboardWords>;
