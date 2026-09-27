import { prisma, type DbClient } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, PlanLimitError } from "@/lib/errors";
import { actorOf, requireAnyPermission, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { hasFeature } from "@/lib/subscription/limits";
import { PLAN_FEATURES } from "@/config/plans";
import { ALL_PERMISSIONS, isPermission, type Permission } from "@/lib/permissions/catalog";
import { OWNER_ROLE_KEY } from "@/lib/permissions/roles";
import {
  ADMIN_PERMISSIONS,
  duplicateRoleSchema,
  roleSchema,
  type DuplicateRoleInput,
  type RoleInput,
} from "@/lib/validation/settings";

const SENSITIVE_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(ADMIN_PERMISSIONS);

function assertCanGrant(ctx: TenantContext, before: readonly string[], after: readonly Permission[]) {
  if (ctx.isOwner) return;
  const previous = new Set(before);
  const escalated = after.filter((p) => !previous.has(p) && SENSITIVE_PERMISSIONS.has(p) && !ctx.permissions.has(p));
  if (escalated.length) {
    throw new ForbiddenError("You can only grant administrative permissions that you hold yourself.");
  }
}

function sortPermissions(list: readonly string[]): Permission[] {
  const order = new Map(ALL_PERMISSIONS.map((p, i) => [p, i]));
  return list.filter(isPermission).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

async function assertCustomRolesAllowed(ctx: TenantContext) {
  if (!(await hasFeature(prisma, ctx.organizationId, PLAN_FEATURES.customRoles))) {
    throw new PlanLimitError("Custom roles aren't included in your plan. Upgrade to create your own roles.");
  }
}

async function assertNameAvailable(db: DbClient, organizationId: string, name: string, exceptId?: string) {
  const clash = await db.role.findFirst({
    where: { organizationId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ConflictError(`A role named "${name}" already exists.`);
}

async function uniqueRoleKey(db: DbClient, organizationId: string, name: string) {
  const base = `CUSTOM_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "ROLE"}`;
  for (let i = 0; i < 50; i++) {
    const key = i === 0 ? base : `${base}_${i + 1}`;
    const exists = await db.role.findUnique({ where: { organizationId_key: { organizationId, key } }, select: { id: true } });
    if (!exists) return key;
  }
  return `${base}_${Date.now().toString(36).toUpperCase()}`;
}

const pendingInvitationWhere = () => ({ acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } });

/** All roles of the organization with usage counts. */
export async function listRoles(ctx: TenantContext) {
  requirePermission(ctx, "settings.roles");
  const [roles, customRolesAllowed] = await Promise.all([
    prisma.role.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { members: true, invitations: { where: pendingInvitationWhere() } } },
      },
    }),
    hasFeature(prisma, ctx.organizationId, PLAN_FEATURES.customRoles),
  ]);
  return {
    customRolesAllowed,
    roles: roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isOwnerRole: r.key === OWNER_ROLE_KEY,
      defaultAllHostels: r.defaultAllHostels,
      permissions: sortPermissions(r.permissions.map((p) => p.permission)),
      memberCount: r._count.members,
      pendingInvitations: r._count.invitations,
      isCurrentUserRole: r.id === ctx.roleId,
      updatedAt: r.updatedAt,
    })),
  };
}

/** Lightweight list for role pickers (members & invitations). */
export async function listRoleOptions(ctx: TenantContext) {
  requireAnyPermission(ctx, "settings.members", "settings.roles");
  const roles = await prisma.role.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    select: { id: true, key: true, name: true, description: true, isSystem: true, defaultAllHostels: true },
  });
  return roles.map((r) => ({ ...r, isOwnerRole: r.key === OWNER_ROLE_KEY }));
}

export async function getRole(ctx: TenantContext, id: string) {
  requirePermission(ctx, "settings.roles");
  const role = await prisma.role.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      permissions: { select: { permission: true } },
      members: {
        orderBy: { createdAt: "asc" },
        take: 50,
        select: { id: true, status: true, user: { select: { name: true, email: true } } },
      },
      _count: { select: { members: true, invitations: { where: pendingInvitationWhere() } } },
    },
  });
  if (!role) throw new NotFoundError("Role");
  const isOwnerRole = role.key === OWNER_ROLE_KEY;
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isOwnerRole,
    defaultAllHostels: role.defaultAllHostels,
    // The owner role always carries the full catalog, including permissions added after it was created.
    permissions: isOwnerRole ? [...ALL_PERMISSIONS] : sortPermissions(role.permissions.map((p) => p.permission)),
    members: role.members.map((m) => ({ id: m.id, status: m.status, name: m.user.name, email: m.user.email })),
    memberCount: role._count.members,
    pendingInvitations: role._count.invitations,
    isCurrentUserRole: role.id === ctx.roleId,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

export async function createRole(ctx: TenantContext, raw: RoleInput) {
  requirePermission(ctx, "settings.roles");
  const input = parseInput(roleSchema, raw);
  await assertCustomRolesAllowed(ctx);
  assertCanGrant(ctx, [], input.permissions);
  await assertNameAvailable(prisma, ctx.organizationId, input.name);

  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        organizationId: ctx.organizationId,
        key: await uniqueRoleKey(tx, ctx.organizationId, input.name),
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        defaultAllHostels: input.defaultAllHostels,
        permissions: { create: input.permissions.map((permission) => ({ permission })) },
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "role.created",
        entityType: "Role",
        entityId: role.id,
        after: { name: role.name, defaultAllHostels: role.defaultAllHostels, permissions: sortPermissions(input.permissions) },
      },
      tx,
    );
    return { id: role.id };
  });
}

export async function duplicateRole(ctx: TenantContext, id: string, raw: DuplicateRoleInput) {
  requirePermission(ctx, "settings.roles");
  const input = parseInput(duplicateRoleSchema, raw);
  await assertCustomRolesAllowed(ctx);
  const source = await prisma.role.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { permissions: { select: { permission: true } } },
  });
  if (!source) throw new NotFoundError("Role");
  const permissions =
    source.key === OWNER_ROLE_KEY ? [...ALL_PERMISSIONS] : sortPermissions(source.permissions.map((p) => p.permission));
  assertCanGrant(ctx, [], permissions);
  await assertNameAvailable(prisma, ctx.organizationId, input.name);

  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        organizationId: ctx.organizationId,
        key: await uniqueRoleKey(tx, ctx.organizationId, input.name),
        name: input.name,
        description: source.description,
        isSystem: false,
        defaultAllHostels: source.defaultAllHostels,
        permissions: { create: permissions.map((permission) => ({ permission })) },
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "role.created",
        entityType: "Role",
        entityId: role.id,
        metadata: { duplicatedFrom: { id: source.id, name: source.name } },
        after: { name: role.name, defaultAllHostels: role.defaultAllHostels, permissions },
      },
      tx,
    );
    return { id: role.id };
  });
}

export async function updateRole(ctx: TenantContext, id: string, raw: RoleInput) {
  requirePermission(ctx, "settings.roles");
  const input = parseInput(roleSchema, raw);
  const role = await prisma.role.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { permissions: { select: { permission: true } } },
  });
  if (!role) throw new NotFoundError("Role");
  if (role.key === OWNER_ROLE_KEY) throw new BusinessRuleError("The Owner role always has every permission and can't be edited.");

  const beforePermissions = sortPermissions(role.permissions.map((p) => p.permission));
  const afterPermissions = sortPermissions(input.permissions);

  if (role.id === ctx.roleId && !afterPermissions.includes("settings.roles")) {
    throw new BusinessRuleError(
      "You can't remove \"Manage roles and permissions\" from your own role — you would lose access to this page.",
    );
  }
  assertCanGrant(ctx, beforePermissions, afterPermissions);
  if (input.name.toLowerCase() !== role.name.toLowerCase()) {
    await assertNameAvailable(prisma, ctx.organizationId, input.name, role.id);
  }

  const added = afterPermissions.filter((p) => !beforePermissions.includes(p));
  const removed = beforePermissions.filter((p) => !afterPermissions.includes(p));
  const permissionsChanged = added.length > 0 || removed.length > 0;

  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: role.id },
      data: { name: input.name, description: input.description ?? null, defaultAllHostels: input.defaultAllHostels },
    });
    if (permissionsChanged) {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({ data: afterPermissions.map((permission) => ({ roleId: role.id, permission })) });
    }
    await audit(
      actorOf(ctx),
      {
        action: permissionsChanged ? "role.permissions_changed" : "role.updated",
        entityType: "Role",
        entityId: role.id,
        before: {
          name: role.name,
          description: role.description,
          defaultAllHostels: role.defaultAllHostels,
          permissions: beforePermissions,
        },
        after: {
          name: input.name,
          description: input.description ?? null,
          defaultAllHostels: input.defaultAllHostels,
          permissions: afterPermissions,
        },
        metadata: permissionsChanged ? { added, removed } : undefined,
      },
      tx,
    );
  });
  return { id: role.id };
}

export async function deleteRole(ctx: TenantContext, id: string) {
  requirePermission(ctx, "settings.roles");
  const role = await prisma.role.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      permissions: { select: { permission: true } },
      _count: { select: { members: true, invitations: { where: pendingInvitationWhere() } } },
    },
  });
  if (!role) throw new NotFoundError("Role");
  if (role.isSystem || role.key === OWNER_ROLE_KEY) throw new BusinessRuleError("Built-in roles can't be deleted.");
  if (role._count.members > 0) {
    throw new BusinessRuleError(
      `${role._count.members} member${role._count.members === 1 ? " has" : "s have"} this role. Move them to another role first.`,
    );
  }
  if (role._count.invitations > 0) {
    throw new BusinessRuleError("There are pending invitations for this role. Revoke them before deleting it.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id: role.id } });
    await audit(
      actorOf(ctx),
      {
        action: "role.deleted",
        entityType: "Role",
        entityId: role.id,
        before: { name: role.name, permissions: sortPermissions(role.permissions.map((p) => p.permission)) },
      },
      tx,
    );
  });
}
