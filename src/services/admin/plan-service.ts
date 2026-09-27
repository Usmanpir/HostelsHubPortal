import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { idSchema } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import { planSchema, type PlanInput, type PlanOutput } from "@/lib/validation/admin";
import type { PlanLimits } from "@/config/plans";
import { adminAudit, assertAdmin, type AdminContext } from "./guard";

function toLimits(input: PlanOutput): PlanLimits {
  return {
    maxHostels: input.maxHostels,
    maxBeds: input.maxBeds,
    maxResidents: input.maxResidents,
    maxStaff: input.maxStaff,
    maxStorageMb: input.maxStorageMb,
  };
}

function planData(input: PlanOutput) {
  return {
    name: input.name,
    description: input.description ?? null,
    priceMonthly: input.priceMonthly,
    priceYearly: input.priceYearly,
    currency: input.currency,
    trialDays: input.trialDays,
    limits: toLimits(input),
    features: [...new Set(input.features)],
    isPublic: input.isPublic,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

export async function listPlans(ctx: AdminContext) {
  assertAdmin(ctx);
  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { subscriptions: true } },
    },
  });
  const active = await prisma.subscription.groupBy({ by: ["planId"], where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, _count: { _all: true } });
  return serialize(
    plans.map(({ _count, ...p }) => ({
      ...p,
      limits: (p.limits ?? {}) as Partial<PlanLimits>,
      subscriptions: _count.subscriptions,
      liveSubscriptions: active.find((a) => a.planId === p.id)?._count._all ?? 0,
    })),
  );
}

export async function listPlanOptions(ctx: AdminContext) {
  assertAdmin(ctx);
  return prisma.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, key: true, name: true, isActive: true, currency: true, priceMonthly: true, priceYearly: true },
  }).then(serialize);
}

export async function getPlan(ctx: AdminContext, rawId: string) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw new NotFoundError("Plan");
  return serialize({ ...plan, limits: (plan.limits ?? {}) as Partial<PlanLimits> });
}

export async function createPlan(ctx: AdminContext, raw: PlanInput) {
  assertAdmin(ctx);
  const input = parseInput(planSchema, raw);
  const existing = await prisma.plan.findUnique({ where: { key: input.key }, select: { id: true } });
  if (existing) throw new ConflictError(`A plan with key "${input.key}" already exists.`);
  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.create({ data: { key: input.key, ...planData(input) } });
    await adminAudit(ctx, { action: "admin.plan.created", entityType: "Plan", entityId: plan.id, after: plan }, tx);
    return serialize(plan);
  });
}

/** The plan key is immutable (code and seeds refer to it). */
export async function updatePlan(ctx: AdminContext, rawId: string, raw: PlanInput) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const input = parseInput(planSchema, raw);
  return prisma.$transaction(async (tx) => {
    const before = await tx.plan.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Plan");
    const plan = await tx.plan.update({ where: { id }, data: planData(input) });
    await adminAudit(ctx, { action: "admin.plan.updated", entityType: "Plan", entityId: id, before, after: plan }, tx);
    return serialize(plan);
  });
}
