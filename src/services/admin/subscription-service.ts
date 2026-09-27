import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { idSchema, paginate, toPaginated } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import {
  adminSubscriptionListSchema,
  subscriptionStatusSchema,
  type AdminSubscriptionListInput,
  type SubscriptionStatusInput,
} from "@/lib/validation/admin";
import { adminAudit, assertAdmin, type AdminContext } from "./guard";

export async function listSubscriptions(ctx: AdminContext, raw: AdminSubscriptionListInput = {}) {
  assertAdmin(ctx);
  const input = parseInput(adminSubscriptionListSchema, raw);
  const { skip, take, page, pageSize } = paginate(input);
  const where: Prisma.SubscriptionWhereInput = {
    organization: {
      deletedAt: null,
      ...(input.q
        ? { OR: [{ name: { contains: input.q, mode: "insensitive" } }, { slug: { contains: input.q, mode: "insensitive" } }] }
        : {}),
    },
    ...(input.status ? { status: input.status } : {}),
    ...(input.planId ? { planId: input.planId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: [{ currentPeriodEnd: "asc" }],
      skip,
      take,
      select: {
        id: true,
        status: true,
        interval: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        provider: true,
        updatedAt: true,
        organization: { select: { id: true, name: true, slug: true, status: true } },
        plan: { select: { id: true, name: true, priceMonthly: true, priceYearly: true, currency: true } },
      },
    }),
    prisma.subscription.count({ where }),
  ]);
  return serialize(toPaginated(items, total, page, pageSize));
}

/**
 * Manual status override for offline billing: mark a subscription ACTIVE
 * (starting a fresh period if the current one has lapsed) or EXPIRED.
 */
export async function setSubscriptionStatus(ctx: AdminContext, rawId: string, raw: SubscriptionStatusInput) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const { status } = parseInput(subscriptionStatusSchema, raw);
  await prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({
      where: { id },
      select: { id: true, organizationId: true, status: true, interval: true, currentPeriodStart: true, currentPeriodEnd: true, trialEndsAt: true },
    });
    if (!sub) throw new NotFoundError("Subscription");
    if (sub.status === status) throw new BusinessRuleError(`This subscription is already ${status === "ACTIVE" ? "active" : "expired"}.`);

    const now = new Date();
    let data: Prisma.SubscriptionUpdateInput;
    if (status === "ACTIVE") {
      const lapsed = sub.currentPeriodEnd <= now || sub.status === "TRIALING";
      const start = lapsed ? now : sub.currentPeriodStart;
      const end = new Date(start);
      if (sub.interval === "YEARLY") end.setUTCFullYear(end.getUTCFullYear() + 1);
      else end.setUTCMonth(end.getUTCMonth() + 1);
      data = {
        status,
        trialEndsAt: null,
        canceledAt: null,
        cancelAtPeriodEnd: false,
        ...(lapsed ? { currentPeriodStart: start, currentPeriodEnd: end } : {}),
      };
    } else {
      data = {
        status,
        cancelAtPeriodEnd: false,
        ...(sub.currentPeriodEnd > now ? { currentPeriodEnd: now } : {}),
        ...(sub.trialEndsAt && sub.trialEndsAt > now ? { trialEndsAt: now } : {}),
      };
    }
    const updated = await tx.subscription.update({
      where: { id },
      data,
      select: { status: true, currentPeriodStart: true, currentPeriodEnd: true, trialEndsAt: true },
    });
    await adminAudit(
      ctx,
      {
        action: "admin.subscription.status_changed",
        entityType: "Subscription",
        entityId: id,
        organizationId: sub.organizationId,
        before: { status: sub.status, currentPeriodStart: sub.currentPeriodStart, currentPeriodEnd: sub.currentPeriodEnd, trialEndsAt: sub.trialEndsAt },
        after: updated,
      },
      tx,
    );
  });
}
