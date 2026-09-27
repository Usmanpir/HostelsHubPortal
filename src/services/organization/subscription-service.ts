import { addMonths, addYears } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError, PlanLimitError } from "@/lib/errors";
import { actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { getSubscription, getUsage, isSubscriptionUsable } from "@/lib/subscription/limits";
import { getBillingProvider, manualBillingProvider } from "@/lib/subscription/provider";
import { PLAN_FEATURES, TRIAL_PLAN_KEY, type PlanLimits } from "@/config/plans";
import { serialize } from "@/lib/serialize";
import { changePlanSchema, type ChangePlanInput } from "@/lib/validation/settings";

type Usage = Awaited<ReturnType<typeof getUsage>>;

const LIMIT_ROWS: { key: keyof PlanLimits; usage: keyof Usage; label: string; unit?: string }[] = [
  { key: "maxHostels", usage: "hostels", label: "hostels" },
  { key: "maxBeds", usage: "beds", label: "beds" },
  { key: "maxResidents", usage: "residents", label: "active residents" },
  { key: "maxStaff", usage: "staff", label: "staff members" },
  { key: "maxStorageMb", usage: "storageMb", label: "storage", unit: "MB" },
];

/** Plan.limits is JSON; missing keys mean unlimited. */
export function readPlanLimits(json: Prisma.JsonValue | null | undefined): PlanLimits {
  const obj = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    maxHostels: num(obj.maxHostels),
    maxBeds: num(obj.maxBeds),
    maxResidents: num(obj.maxResidents),
    maxStaff: num(obj.maxStaff),
    maxStorageMb: num(obj.maxStorageMb),
  };
}

/** Limits the organization's current usage already exceeds on `limits`. */
function exceededLimits(usage: Usage, limits: PlanLimits) {
  return LIMIT_ROWS.flatMap((row) => {
    const max = limits[row.key];
    const used = usage[row.usage];
    if (max === null || used <= max) return [];
    return [row.unit ? `${used} ${row.unit} of ${row.label} (limit ${max} ${row.unit})` : `${used} ${row.label} (limit ${max})`];
  });
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Current plan, status, usage vs limits and the plans available to switch to. */
export async function getBillingOverview(ctx: TenantContext) {
  requirePermission(ctx, "settings.billing");
  const [subscription, usage, plans] = await Promise.all([
    getSubscription(prisma, ctx.organizationId),
    getUsage(prisma, ctx.organizationId),
    prisma.plan.findMany({
      where: { isActive: true, isPublic: true, key: { not: TRIAL_PLAN_KEY } },
      orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
    }),
  ]);
  const endsAt = subscription
    ? subscription.status === "TRIALING" && subscription.trialEndsAt
      ? subscription.trialEndsAt
      : subscription.currentPeriodEnd
    : null;
  return serialize({
    provider: getBillingProvider().key,
    usable: isSubscriptionUsable(subscription),
    usage,
    subscription: subscription
      ? {
          id: subscription.id,
          /** End of the trial (while trialing) or of the current billing period. */
          endsAt: endsAt!,
          daysLeft: Math.ceil((endsAt!.getTime() - Date.now()) / 86400_000),
          status: subscription.status,
          interval: subscription.interval,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          canceledAt: subscription.canceledAt,
          provider: subscription.provider,
          plan: {
            id: subscription.plan.id,
            key: subscription.plan.key,
            name: subscription.plan.name,
            description: subscription.plan.description,
            priceMonthly: subscription.plan.priceMonthly,
            priceYearly: subscription.plan.priceYearly,
            currency: subscription.plan.currency,
            features: subscription.plan.features,
            limits: readPlanLimits(subscription.plan.limits),
            isTrial: subscription.plan.key === TRIAL_PLAN_KEY,
          },
        }
      : null,
    plans: plans.map((p) => {
      const limits = readPlanLimits(p.limits);
      return {
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        currency: p.currency,
        features: p.features,
        limits,
        /** Current usage that would block switching to this plan. */
        blockers: exceededLimits(usage, limits),
      };
    }),
  });
}

export type ChangePlanResult = { kind: "applied" } | { kind: "redirect"; url: string };

/**
 * Switch plan through the configured billing provider. The manual provider
 * applies the change immediately; card providers return a checkout URL and
 * confirm via webhook later. Downgrades below current usage are refused.
 */
export async function changePlan(ctx: TenantContext, raw: ChangePlanInput): Promise<ChangePlanResult> {
  requirePermission(ctx, "settings.billing");
  const input = parseInput(changePlanSchema, raw);
  if (input.planKey === TRIAL_PLAN_KEY) throw new BusinessRuleError("The free trial can't be selected again. Choose a paid plan.");

  const [plan, current] = await Promise.all([
    prisma.plan.findFirst({ where: { key: input.planKey, isActive: true } }),
    getSubscription(prisma, ctx.organizationId),
  ]);
  if (!plan || (!plan.isPublic && current?.planId !== plan.id)) throw new NotFoundError("Plan");

  if (
    current &&
    current.planId === plan.id &&
    current.interval === input.interval &&
    current.status === "ACTIVE" &&
    !current.cancelAtPeriodEnd
  ) {
    throw new BusinessRuleError(`You're already on the ${plan.name} plan (${input.interval === "YEARLY" ? "yearly" : "monthly"}).`);
  }

  const usage = await getUsage(prisma, ctx.organizationId);
  const exceeded = exceededLimits(usage, readPlanLimits(plan.limits));
  if (exceeded.length) {
    throw new PlanLimitError(
      `You can't switch to ${plan.name} yet — you currently use ${exceeded.join(", ")}. Archive or remove records to fit the plan first.`,
    );
  }

  const provider = getBillingProvider();
  const checkout = await provider.startCheckout({
    organizationId: ctx.organizationId,
    organizationName: ctx.organization.name,
    customerEmail: ctx.userEmail,
    planKey: plan.key,
    interval: input.interval,
    successUrl: `${appUrl()}/settings/billing?checkout=success`,
    cancelUrl: `${appUrl()}/settings/billing?checkout=cancelled`,
  });

  if (checkout.kind === "redirect") {
    await audit(actorOf(ctx), {
      action: "subscription.checkout_started",
      entityType: "Subscription",
      entityId: current?.id ?? null,
      metadata: { provider: provider.key, planKey: plan.key, interval: input.interval },
    });
    return { kind: "redirect", url: checkout.url };
  }

  const now = new Date();
  const periodEnd = input.interval === "YEARLY" ? addYears(now, 1) : addMonths(now, 1);
  await prisma.$transaction(async (tx) => {
    const data = {
      planId: plan.id,
      status: "ACTIVE" as const,
      interval: input.interval,
      trialEndsAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      provider: provider.key,
    };
    const updated = await tx.subscription.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId, ...data },
      update: data,
    });

    // Features the new plan lacks are switched off so settings match what's billed.
    if (!plan.features.includes(PLAN_FEATURES.emailNotifications)) {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: ctx.organizationId },
        select: { notificationSettings: true },
      });
      const settings = org.notificationSettings;
      if (settings && typeof settings === "object" && !Array.isArray(settings) && (settings as Record<string, unknown>).email === true) {
        await tx.organization.update({
          where: { id: ctx.organizationId },
          data: { notificationSettings: { ...(settings as Prisma.JsonObject), email: false } },
        });
      }
    }

    await audit(
      actorOf(ctx),
      {
        action: "subscription.changed",
        entityType: "Subscription",
        entityId: updated.id,
        before: current
          ? {
              plan: current.plan.key,
              status: current.status,
              interval: current.interval,
              currentPeriodEnd: current.currentPeriodEnd,
              cancelAtPeriodEnd: current.cancelAtPeriodEnd,
            }
          : null,
        after: { plan: plan.key, status: data.status, interval: data.interval, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
        metadata: { change: "plan_changed", provider: provider.key },
      },
      tx,
    );
  });
  return { kind: "applied" };
}

/** Schedule cancellation at the end of the current period (trial or paid). */
export async function cancelSubscription(ctx: TenantContext) {
  requirePermission(ctx, "settings.billing");
  const sub = await getSubscription(prisma, ctx.organizationId);
  if (!sub) throw new NotFoundError("Subscription");
  if (sub.status === "CANCELED" || sub.status === "EXPIRED") throw new BusinessRuleError("This subscription has already ended.");
  if (sub.cancelAtPeriodEnd) throw new BusinessRuleError("Cancellation is already scheduled.");

  await getBillingProvider().cancel(ctx.organizationId, sub.providerSubscriptionId);
  const canceledAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true, canceledAt } });
    await audit(
      actorOf(ctx),
      {
        action: "subscription.changed",
        entityType: "Subscription",
        entityId: sub.id,
        before: { cancelAtPeriodEnd: false, canceledAt: sub.canceledAt },
        after: { cancelAtPeriodEnd: true, canceledAt },
        metadata: { change: "cancel_scheduled", plan: sub.plan.key, endsAt: sub.trialEndsAt ?? sub.currentPeriodEnd },
      },
      tx,
    );
  });
}

/** Undo a scheduled cancellation while the period is still running. */
export async function resumeSubscription(ctx: TenantContext) {
  requirePermission(ctx, "settings.billing");
  const sub = await getSubscription(prisma, ctx.organizationId);
  if (!sub) throw new NotFoundError("Subscription");
  if (!sub.cancelAtPeriodEnd) throw new BusinessRuleError("This subscription isn't scheduled to cancel.");
  const endsAt = sub.status === "TRIALING" && sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd;
  if (sub.status === "CANCELED" || sub.status === "EXPIRED" || endsAt <= new Date()) {
    throw new BusinessRuleError("This subscription has already ended. Choose a plan to start a new one.");
  }
  if (sub.provider !== manualBillingProvider.key) {
    throw new BusinessRuleError("Resume this subscription from your payment provider's billing portal.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false, canceledAt: null } });
    await audit(
      actorOf(ctx),
      {
        action: "subscription.changed",
        entityType: "Subscription",
        entityId: sub.id,
        before: { cancelAtPeriodEnd: true, canceledAt: sub.canceledAt },
        after: { cancelAtPeriodEnd: false, canceledAt: null },
        metadata: { change: "cancel_reverted", plan: sub.plan.key },
      },
      tx,
    );
  });
}
