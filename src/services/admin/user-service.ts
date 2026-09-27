import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { idSchema, paginate, toPaginated } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import { adminUserListSchema, superAdminSchema, userStatusSchema, type AdminUserListInput } from "@/lib/validation/admin";
import { adminAudit, assertAdmin, type AdminContext } from "./guard";

/** Platform user accounts. Only account metadata — no tenant records. */
export async function listUsers(ctx: AdminContext, raw: AdminUserListInput = {}) {
  assertAdmin(ctx);
  const input = parseInput(adminUserListSchema, raw);
  const { skip, take, page, pageSize } = paginate(input);
  const where: Prisma.UserWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.role === "superadmin" ? { isSuperAdmin: true } : {}),
    ...(input.q
      ? { OR: [{ name: { contains: input.q, mode: "insensitive" } }, { email: { contains: input.q, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        isSuperAdmin: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        lockedUntil: true,
        createdAt: true,
        _count: { select: { memberships: { where: { status: "ACTIVE" } }, residentProfiles: { where: { archivedAt: null } } } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  const items = rows.map(({ _count, ...u }) => ({
    ...u,
    memberships: _count.memberships,
    residentAccounts: _count.residentProfiles,
    isSelf: u.id === ctx.userId,
  }));
  return serialize(toPaginated(items, total, page, pageSize));
}

async function loadUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, status: true, isSuperAdmin: true } });
  if (!user) throw new NotFoundError("User");
  return user;
}

/** Disable/enable an account. Disabling bumps sessionVersion so live sessions end immediately. */
export async function setUserStatus(ctx: AdminContext, rawId: string, raw: unknown) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const { status } = parseInput(userStatusSchema, raw);
  if (id === ctx.userId && status === "DISABLED") throw new BusinessRuleError("You can't disable your own account.");
  const user = await loadUser(id);
  if (user.status === status) throw new BusinessRuleError(status === "ACTIVE" ? "This account is already active." : "This account is already disabled.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data:
        status === "DISABLED"
          ? { status, sessionVersion: { increment: 1 } }
          : { status, failedLoginCount: 0, lockedUntil: null },
    });
    await adminAudit(
      ctx,
      {
        action: status === "DISABLED" ? "admin.user.disabled" : "admin.user.enabled",
        entityType: "User",
        entityId: id,
        before: { status: user.status },
        after: { status },
        metadata: { email: user.email },
      },
      tx,
    );
  });
}

export async function setSuperAdmin(ctx: AdminContext, rawId: string, raw: unknown) {
  assertAdmin(ctx);
  const id = parseInput(idSchema, rawId);
  const { isSuperAdmin } = parseInput(superAdminSchema, raw);
  if (id === ctx.userId && !isSuperAdmin) throw new BusinessRuleError("You can't revoke your own super admin access.");
  const user = await loadUser(id);
  if (user.isSuperAdmin === isSuperAdmin) {
    throw new BusinessRuleError(isSuperAdmin ? "This user is already a super admin." : "This user is not a super admin.");
  }
  if (isSuperAdmin && user.status !== "ACTIVE") throw new BusinessRuleError("Enable this account before granting super admin access.");
  await prisma.$transaction(async (tx) => {
    if (!isSuperAdmin) {
      const remaining = await tx.user.count({ where: { isSuperAdmin: true, status: "ACTIVE", id: { not: id } } });
      if (remaining === 0) throw new BusinessRuleError("At least one active super admin must remain.");
    }
    await tx.user.update({
      where: { id },
      // Revoking also ends existing sessions so elevated access can't linger.
      data: isSuperAdmin ? { isSuperAdmin } : { isSuperAdmin, sessionVersion: { increment: 1 } },
    });
    await adminAudit(
      ctx,
      {
        action: isSuperAdmin ? "admin.user.super_admin_granted" : "admin.user.super_admin_revoked",
        entityType: "User",
        entityId: id,
        before: { isSuperAdmin: user.isSuperAdmin },
        after: { isSuperAdmin },
        metadata: { email: user.email },
      },
      tx,
    );
  });
}
