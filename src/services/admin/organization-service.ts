import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { BillingInterval } from "@/generated/prisma/enums";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { getUsage } from "@/lib/subscription/limits";
import { idSchema, paginate, toPaginated } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import {
  adminOrganizationListSchema,
  changePlanSchema,
  extendTrialSchema,
  organizationStatusSchema,
  type AdminOrganizationListInput,
  type ChangePlanInput,
  type ExtendTrialInput,
  type OrganizationStatusInput,
} from "@/lib/validation/admin";
import type { PlanLimits } from "@/config/plans";
import { adminAudit, assertAdmin, type AdminContext } from "./guard";

/**
 * Organization management for platform operators. Only organization
 * metadata, subscription state and aggregate usage counts are read here —
 * never residents, staff, invoices or documents.
 */

const LIVE_RESIDENT = { archivedAt: null, status: { in: ["ACTIVE", "NOTICE"] as ("ACTIVE" | "NOTICE")[] } };

export async function listOrganizations(ctx: AdminContext, raw: AdminOrganizationListInput = {}) {
  assertAdmin(ctx);
  const input = parseInput(adminOrganizationListSchema, raw);
  const { skip, take, page, pageSize } = paginate(input);
  const where: Prisma.OrganizationWhereInput = {
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.subscription || input.planId
      ? {
          subscription: {
            ...(input.subscription ? { status: input.subscription } : {}),
            ...(input.planId ? { planId: input.planId } : {}),
          },
        }
      : {}),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: "insensitive" } },
            { slug: { contains: input.q, mode: "insensitive" } },
            { brandName: { contains: input.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        subscription: {
          select: {
            status: true,
            interval: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            plan: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            hostels: { where: { archivedAt: null } },
            residents: { where: LIVE_RESIDENT },
            members: { where: { status: "ACTIVE" } },
          },
        },
      },
    }),
    prisma.organization.count({ where }),
  ]);
  const items = rows.map(({ _count, ...o }) => ({
    ...o,
    hostels: _count.hostels,
    residents: _count.residents,
    members: _count.members,
  }));
  return serialize(toPaginated(items, total, page, pageSize));
}

/** Lightweight lookup for pickers (feature-flag overrides etc.). */
export async function searchOrganizations(ctx: AdminContext, q: string | undefined) {
  assertAdmin(ctx);
  const term = (q ?? "").trim().slice(0, 100);
  return prisma.organization.findMany({
    where: {
      deletedAt: null,
      ...(term
        ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { slug: { contains: term, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, slug: true, status: true },
  });
}

export async function getOrganizationDetail(ctx: AdminContext, rawId: string) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const org = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      brandName: true,
      status: true,
      email: true,
      phone: true,
      city: true,
      country: true,
      timezone: true,
      currency: true,
      locale: true,
      customDomain: true,
      onboardingCompletedAt: true,
      createdAt: true,
      updatedAt: true,
      // Owners are platform accounts (the billing/support contact), not tenant records.
      members: {
        where: { isOwner: true },
        select: { user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } } },
      },
      subscription: {
        select: {
          id: true,
          status: true,
          interval: true,
          trialEndsAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          provider: true,
          plan: { select: { id: true, key: true, name: true, priceMonthly: true, priceYearly: true, currency: true, limits: true } },
        },
      },
      featureOverrides: { select: { flagKey: true, enabled: true }, orderBy: { flagKey: "asc" } },
      _count: { select: { members: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!org) throw new NotFoundError("Organization");

  const [usage, adminHistory] = await Promise.all([
    getUsage(prisma, org.id),
    prisma.auditLog.findMany({
      where: { organizationId: org.id, action: { startsWith: "admin." } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, action: true, createdAt: true, metadata: true, user: { select: { email: true } } },
    }),
  ]);
  const limits = (org.subscription?.plan.limits ?? {}) as Partial<PlanLimits>;
  const { members, _count, ...rest } = org;
  return serialize({
    ...rest,
    owners: members.map((m) => m.user),
    activeMembers: _count.members,
    usage,
    limits,
    adminHistory,
  });
}

async function loadOrg(id: string) {
  const org = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, status: true },
  });
  if (!org) throw new NotFoundError("Organization");
  return org;
}

export async function setOrganizationStatus(ctx: AdminContext, rawId: string, raw: OrganizationStatusInput) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const input = parseInput(organizationStatusSchema, raw);
  const org = await loadOrg(id);
  if (org.status === "CLOSED") throw new BusinessRuleError("This organization is closed and can't be changed here.");
  if (org.status === input.status) {
    throw new BusinessRuleError(input.status === "ACTIVE" ? "This organization is already active." : "This organization is already suspended.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id }, data: { status: input.status } });
    await adminAudit(
      ctx,
      {
        action: input.status === "SUSPENDED" ? "admin.organization.suspended" : "admin.organization.reactivated",
        entityType: "Organization",
        entityId: id,
        organizationId: id,
        before: { status: org.status },
        after: { status: input.status },
        metadata: input.reason ? { reason: input.reason } : undefined,
      },
      tx,
    );
  });
}

function periodEnd(from: Date, interval: BillingInterval) {
  const end = new Date(from);
  if (interval === "YEARLY") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export async function changeOrganizationPlan(ctx: AdminContext, rawId: string, raw: ChangePlanInput) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const input = parseInput(changePlanSchema, raw);
  await loadOrg(id);
  const plan = await prisma.plan.findFirst({ where: { id: input.planId, isActive: true }, select: { id: true, key: true, name: true } });
  if (!plan) throw new NotFoundError("Plan");

  const now = new Date();
  const data = {
    planId: plan.id,
    interval: input.interval,
    status: "ACTIVE" as const,
    trialEndsAt: null,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd(now, input.interval),
    cancelAtPeriodEnd: false,
    canceledAt: null,
  };
  await prisma.$transaction(async (tx) => {
    const before = await tx.subscription.findUnique({
      where: { organizationId: id },
      select: { status: true, interval: true, currentPeriodEnd: true, plan: { select: { key: true } } },
    });
    const sub = await tx.subscription.upsert({
      where: { organizationId: id },
      create: { organizationId: id, ...data },
      update: data,
      select: { id: true },
    });
    await adminAudit(
      ctx,
      {
        action: "admin.subscription.plan_changed",
        entityType: "Subscription",
        entityId: sub.id,
        organizationId: id,
        before: before ? { plan: before.plan.key, status: before.status, interval: before.interval, currentPeriodEnd: before.currentPeriodEnd } : null,
        after: { plan: plan.key, status: data.status, interval: data.interval, currentPeriodEnd: data.currentPeriodEnd },
      },
      tx,
    );
  });
}

export async function extendTrial(ctx: AdminContext, rawId: string, raw: ExtendTrialInput) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const input = parseInput(extendTrialSchema, raw);
  await loadOrg(id);
  await prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({
      where: { organizationId: id },
      select: { id: true, status: true, trialEndsAt: true, currentPeriodEnd: true },
    });
    if (!sub) throw new BusinessRuleError("This organization has no subscription. Assign a plan instead.");
    if (sub.status === "ACTIVE") {
      throw new BusinessRuleError("This organization is on an active paid plan. Change the plan instead of extending a trial.");
    }
    const now = new Date();
    const base = sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt > now ? sub.trialEndsAt : now;
    const trialEndsAt = new Date(base.getTime() + input.days * 86400_000);
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: "TRIALING", trialEndsAt, currentPeriodEnd: trialEndsAt, canceledAt: null, cancelAtPeriodEnd: false },
    });
    await adminAudit(
      ctx,
      {
        action: "admin.subscription.trial_extended",
        entityType: "Subscription",
        entityId: sub.id,
        organizationId: id,
        before: { status: sub.status, trialEndsAt: sub.trialEndsAt },
        after: { status: "TRIALING", trialEndsAt },
        metadata: { days: input.days },
      },
      tx,
    );
  });
}

/** Name only — used to label filtered views. */
export async function getOrganizationName(ctx: AdminContext, rawId: string) {
  assertAdmin(ctx);
  const result = idSchema.safeParse(rawId);
  if (!result.success) return null;
  const org = await prisma.organization.findUnique({ where: { id: result.data }, select: { name: true } });
  return org?.name ?? null;
}
