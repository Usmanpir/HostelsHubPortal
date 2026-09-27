import "server-only";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { assertAdmin, type AdminContext } from "./guard";

/** Platform-level audit actions shown as "system activity" (no tenant operations). */
export const PLATFORM_ACTIONS = ["organization.created", "auth.registered", "subscription.changed"] as const;

export function platformActivityWhere() {
  return { OR: [{ action: { in: [...PLATFORM_ACTIONS] } }, { action: { startsWith: "admin." } }] };
}

export type MonthlyCount = { month: string; label: string; count: number };

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Headline counts and trends for the super admin overview. Aggregates only. */
export async function getPlatformOverview(ctx: AdminContext) {
  assertAdmin(ctx);
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const [organizations, suspended, activeSubs, trialOrgs, pastDue, hostels, residents, users, byPlan, monthly, activity] =
    await Promise.all([
      prisma.organization.count({ where: { deletedAt: null } }),
      prisma.organization.count({ where: { deletedAt: null, status: "SUSPENDED" } }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "TRIALING", OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: now } }] } }),
      prisma.subscription.count({ where: { status: "PAST_DUE" } }),
      prisma.hostel.count({ where: { archivedAt: null, organization: { deletedAt: null } } }),
      prisma.resident.count({
        where: { archivedAt: null, status: { in: ["ACTIVE", "NOTICE"] }, organization: { deletedAt: null } },
      }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.groupBy({ by: ["planId", "interval"], where: { status: "ACTIVE" }, _count: { _all: true } }),
      prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, COUNT(*)::int AS count
        FROM "Organization"
        WHERE "createdAt" >= ${start} AND "deletedAt" IS NULL
        GROUP BY 1
        ORDER BY 1`,
      prisma.auditLog.findMany({
        where: platformActivityWhere(),
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          action: true,
          entityType: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
          user: { select: { email: true } },
        },
      }),
    ]);

  // MRR: monthly plans at list price, yearly plans at price / 12 — per currency.
  const plans = await prisma.plan.findMany({
    where: { id: { in: [...new Set(byPlan.map((b) => b.planId))] } },
    select: { id: true, priceMonthly: true, priceYearly: true, currency: true },
  });
  const mrr = new Map<string, number>();
  for (const row of byPlan) {
    const plan = plans.find((p) => p.id === row.planId);
    if (!plan) continue;
    const perMonth = row.interval === "YEARLY" ? toNumber(plan.priceYearly) / 12 : toNumber(plan.priceMonthly);
    mrr.set(plan.currency, round2((mrr.get(plan.currency) ?? 0) + perMonth * row._count._all));
  }

  const counts = new Map(monthly.map((m) => [m.month, Number(m.count)]));
  const growth: MonthlyCount[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = monthKey(d);
    return {
      month: key,
      label: new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" }).format(d),
      count: counts.get(key) ?? 0,
    };
  });

  return {
    organizations,
    suspended,
    activeSubscriptions: activeSubs,
    trialOrganizations: trialOrgs,
    pastDue,
    hostels,
    residents,
    users,
    mrr: [...mrr.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
    growth,
    activity,
  };
}
