import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { idSchema } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import {
  FLAG_KEY_SCHEMA,
  featureFlagSchema,
  featureFlagUpdateSchema,
  flagOverrideSchema,
  type FeatureFlagInput,
  type FeatureFlagUpdateInput,
  type FlagOverrideInput,
} from "@/lib/validation/admin";
import { adminAudit, assertAdmin, type AdminContext } from "./guard";

/**
 * Resolve a feature flag for an organization: a per-organization override
 * wins, otherwise the global flag value; unknown flags are off.
 */
export async function isFeatureEnabled(organizationId: string, key: string): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    select: { enabled: true, overrides: { where: { organizationId }, select: { enabled: true }, take: 1 } },
  });
  if (!flag) return false;
  return flag.overrides[0]?.enabled ?? flag.enabled;
}

export async function listFeatureFlags(ctx: AdminContext) {
  assertAdmin(ctx);
  const flags = await prisma.featureFlag.findMany({
    orderBy: { key: "asc" },
    select: {
      key: true,
      description: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      overrides: {
        orderBy: { organization: { name: "asc" } },
        select: { enabled: true, organization: { select: { id: true, name: true, slug: true } } },
      },
    },
  });
  return serialize(flags);
}

export async function createFeatureFlag(ctx: AdminContext, raw: FeatureFlagInput) {
  assertAdmin(ctx);
  const input = parseInput(featureFlagSchema, raw);
  const exists = await prisma.featureFlag.findUnique({ where: { key: input.key }, select: { key: true } });
  if (exists) throw new ConflictError(`A flag with key "${input.key}" already exists.`);
  return prisma.$transaction(async (tx) => {
    const flag = await tx.featureFlag.create({
      data: { key: input.key, description: input.description ?? null, enabled: input.enabled },
    });
    await adminAudit(ctx, { action: "admin.feature_flag.created", entityType: "FeatureFlag", entityId: flag.key, after: flag }, tx);
    return serialize(flag);
  });
}

export async function updateFeatureFlag(ctx: AdminContext, rawKey: string, raw: FeatureFlagUpdateInput) {
  assertAdmin(ctx);
  const key = parseInput(FLAG_KEY_SCHEMA, rawKey);
  const input = parseInput(featureFlagUpdateSchema, raw);
  return prisma.$transaction(async (tx) => {
    const before = await tx.featureFlag.findUnique({ where: { key } });
    if (!before) throw new NotFoundError("Feature flag");
    const flag = await tx.featureFlag.update({
      where: { key },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...("description" in (raw ?? {}) ? { description: input.description ?? null } : {}),
      },
    });
    await adminAudit(
      ctx,
      {
        action: input.enabled !== undefined && input.enabled !== before.enabled ? "admin.feature_flag.toggled" : "admin.feature_flag.updated",
        entityType: "FeatureFlag",
        entityId: key,
        before: { enabled: before.enabled, description: before.description },
        after: { enabled: flag.enabled, description: flag.description },
      },
      tx,
    );
    return serialize(flag);
  });
}

/** Deleting a flag removes its overrides; code treats unknown flags as off. */
export async function deleteFeatureFlag(ctx: AdminContext, rawKey: string) {
  assertAdmin(ctx);
  const key = parseInput(FLAG_KEY_SCHEMA, rawKey);
  await prisma.$transaction(async (tx) => {
    const before = await tx.featureFlag.findUnique({ where: { key }, include: { _count: { select: { overrides: true } } } });
    if (!before) throw new NotFoundError("Feature flag");
    await tx.featureFlag.delete({ where: { key } });
    await adminAudit(
      ctx,
      {
        action: "admin.feature_flag.deleted",
        entityType: "FeatureFlag",
        entityId: key,
        before: { enabled: before.enabled, description: before.description, overrides: before._count.overrides },
      },
      tx,
    );
  });
}

export async function setFlagOverride(ctx: AdminContext, rawKey: string, raw: FlagOverrideInput) {
  assertAdmin(ctx);
  const key = parseInput(FLAG_KEY_SCHEMA, rawKey);
  const input = parseInput(flagOverrideSchema, raw);
  const [flag, org] = await Promise.all([
    prisma.featureFlag.findUnique({ where: { key }, select: { key: true } }),
    prisma.organization.findFirst({ where: { id: input.organizationId, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  if (!flag) throw new NotFoundError("Feature flag");
  if (!org) throw new NotFoundError("Organization");
  await prisma.$transaction(async (tx) => {
    const before = await tx.organizationFeatureFlag.findUnique({
      where: { organizationId_flagKey: { organizationId: org.id, flagKey: key } },
      select: { enabled: true },
    });
    await tx.organizationFeatureFlag.upsert({
      where: { organizationId_flagKey: { organizationId: org.id, flagKey: key } },
      create: { organizationId: org.id, flagKey: key, enabled: input.enabled },
      update: { enabled: input.enabled },
    });
    await adminAudit(
      ctx,
      {
        action: "admin.feature_flag.override_set",
        entityType: "FeatureFlag",
        entityId: key,
        organizationId: org.id,
        before: before ?? null,
        after: { enabled: input.enabled },
      },
      tx,
    );
  });
}

export async function removeFlagOverride(ctx: AdminContext, rawKey: string, rawOrganizationId: string) {
  assertAdmin(ctx);
  const key = parseInput(FLAG_KEY_SCHEMA, rawKey);
  const organizationId = parseInput(idSchema, rawOrganizationId);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.organizationFeatureFlag.findUnique({
      where: { organizationId_flagKey: { organizationId, flagKey: key } },
      select: { enabled: true },
    });
    if (!existing) throw new NotFoundError("Override");
    await tx.organizationFeatureFlag.delete({ where: { organizationId_flagKey: { organizationId, flagKey: key } } });
    await adminAudit(
      ctx,
      {
        action: "admin.feature_flag.override_removed",
        entityType: "FeatureFlag",
        entityId: key,
        organizationId,
        before: existing,
      },
      tx,
    );
  });
}
