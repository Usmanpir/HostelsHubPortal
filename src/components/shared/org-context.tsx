"use client";

import { createContext, useContext } from "react";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { termsFor, type Terms } from "@/lib/terms";
import type { BusinessType } from "@/generated/prisma/enums";

export type OrgClientInfo = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  locale: string;
  permissions: string[];
  activeHostelId: string | null;
  businessType?: BusinessType;
  modules?: { owners: boolean; dealer: boolean; publicListings: boolean };
};

const OrgContext = createContext<OrgClientInfo | null>(null);

export function OrgProvider({ value, children }: { value: OrgClientInfo; children: React.ReactNode }) {
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside <OrgProvider>");
  return ctx;
}

/** Client-side permission check for UI affordances only — the server re-checks. */
export function useCan() {
  const { permissions } = useOrg();
  return (permission: string) => permissions.includes(permission);
}

/** Business vocabulary for the current organization (Hostel/Resident vs Property/Tenant). */
export function useTerms(): Terms {
  const org = useContext(OrgContext);
  return termsFor(org?.businessType);
}

export function useFormatters() {
  const org = useContext(OrgContext);
  const currency = org?.currency ?? "PKR";
  const locale = org?.locale ?? "en";
  return {
    currency,
    money: (n: number | null | undefined) => formatMoney(n, currency, locale),
    date: (d: Date | string | null | undefined) => formatDate(d, locale),
    dateTime: (d: Date | string | null | undefined) => formatDateTime(d, org?.timezone, locale),
  };
}
