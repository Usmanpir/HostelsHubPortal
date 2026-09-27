import type { DbClient } from "@/lib/db/prisma";
import { PlanLimitError } from "@/lib/errors";
import type { PlanFeature, PlanLimits } from "@/config/plans";

export type LimitedResource = "hostels" | "beds" | "residents" | "staff";

const LIMIT_KEY: Record<LimitedResource, keyof PlanLimits> = {
  hostels: "maxHostels",
  beds: "maxBeds",
  residents: "maxResidents",
  staff: "maxStaff",
};

const LABEL: Record<LimitedResource, string> = {
  hostels: "hostels",
  beds: "beds",
  residents: "active residents",
  staff: "staff members",
};

export async function getSubscription(db: DbClient, organizationId: string) {
  return db.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
}

export function isSubscriptionUsable(sub: { status: string; trialEndsAt: Date | null; currentPeriodEnd: Date } | null) {
  if (!sub) return false;
  const now = new Date();
  if (sub.status === "TRIALING") return !sub.trialEndsAt || sub.trialEndsAt > now;
  if (sub.status === "ACTIVE") return true;
  // Grace period while a payment is retried.
  if (sub.status === "PAST_DUE") return sub.currentPeriodEnd.getTime() + 7 * 86400_000 > now.getTime();
  return false;
}

export async function getUsage(db: DbClient, organizationId: string) {
  const [hostels, beds, residents, staff, storage] = await Promise.all([
    db.hostel.count({ where: { organizationId, archivedAt: null } }),
    db.bed.count({ where: { organizationId, archivedAt: null } }),
    db.resident.count({ where: { organizationId, archivedAt: null, status: { in: ["ACTIVE", "NOTICE", "SUSPENDED"] } } }),
    db.staff.count({ where: { organizationId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } }),
    db.storedFile.aggregate({ where: { organizationId, deletedAt: null }, _sum: { size: true } }),
  ]);
  return {
    hostels,
    beds,
    residents,
    staff,
    storageMb: Math.round(((storage._sum.size ?? 0) / 1024 / 1024) * 10) / 10,
  };
}

/**
 * Enforce plan limits before creating limited resources. Throws
 * PlanLimitError (HTTP 402) with an upgrade hint.
 */
export async function assertWithinLimit(
  db: DbClient,
  organizationId: string,
  resource: LimitedResource,
  adding = 1,
) {
  const sub = await getSubscription(db, organizationId);
  if (!isSubscriptionUsable(sub)) {
    throw new PlanLimitError("Your subscription is inactive. Renew your plan to add new records.");
  }
  const limits = (sub!.plan.limits ?? {}) as Partial<PlanLimits>;
  const max = limits[LIMIT_KEY[resource]];
  if (max === null || max === undefined) return;
  const usage = await getUsage(db, organizationId);
  if (usage[resource] + adding > max) {
    throw new PlanLimitError(
      `Your ${sub!.plan.name} plan allows up to ${max} ${LABEL[resource]}. Upgrade your plan to add more.`,
    );
  }
}

export async function hasFeature(db: DbClient, organizationId: string, feature: PlanFeature) {
  const sub = await getSubscription(db, organizationId);
  return !!sub && isSubscriptionUsable(sub) && sub.plan.features.includes(feature);
}
