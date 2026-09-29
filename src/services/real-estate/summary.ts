import { prisma } from "@/lib/db/prisma";
import { can, type TenantContext } from "@/lib/tenant/context";
import { toNumber } from "@/lib/serialize";
import { dayBounds, periodStarts } from "./shared";

export type SalesSummary = {
  /** ACTIVE + UNDER_OFFER listings (null without listings.view). */
  activeListings: number | null;
  /** Leads created since Monday in the org time zone (null without leads.view). */
  newLeadsThisWeek: number | null;
  /** Scheduled viewings today in the org time zone (null without leads.view). */
  viewingsToday: number | null;
  /** Σ agreed amount of OPEN + AGREEMENT deals (null without deals.view). */
  openDealsValue: number | null;
  /** Σ commission of deals closed won this month (null without deals.view). */
  commissionThisMonth: number | null;
};

/**
 * Sales & leasing headline numbers for the dashboard. Returns null when the
 * module is disabled or the member can't see any part of it; individual
 * metrics are null when the member lacks that area's permission.
 */
export async function getSalesSummary(ctx: TenantContext): Promise<SalesSummary | null> {
  if (!ctx.organization.dealerEnabled) return null;
  const listings = can(ctx, "listings.view");
  const leads = can(ctx, "leads.view");
  const deals = can(ctx, "deals.view");
  if (!listings && !leads && !deals) return null;

  const org = { organizationId: ctx.organizationId };
  const { weekStart, monthStart } = periodStarts(ctx);
  const today = dayBounds(ctx);

  const [activeListings, newLeadsThisWeek, viewingsToday, openDeals, wonThisMonth] = await Promise.all([
    listings ? prisma.listing.count({ where: { ...org, status: { in: ["ACTIVE", "UNDER_OFFER"] } } }) : null,
    leads ? prisma.lead.count({ where: { ...org, archivedAt: null, createdAt: { gte: weekStart } } }) : null,
    leads
      ? prisma.viewing.count({
          where: { ...org, status: "SCHEDULED", scheduledAt: { gte: today.start, lt: today.end }, lead: { archivedAt: null } },
        })
      : null,
    deals ? prisma.deal.aggregate({ where: { ...org, stage: { in: ["OPEN", "AGREEMENT"] } }, _sum: { agreedAmount: true } }) : null,
    deals
      ? prisma.deal.aggregate({ where: { ...org, stage: "CLOSED_WON", closedAt: { gte: monthStart } }, _sum: { commissionAmount: true } })
      : null,
  ]);

  return {
    activeListings,
    newLeadsThisWeek,
    viewingsToday,
    openDealsValue: openDeals ? toNumber(openDeals._sum.agreedAmount) : null,
    commissionThisMonth: wonThisMonth ? toNumber(wonThisMonth._sum.commissionAmount) : null,
  };
}
