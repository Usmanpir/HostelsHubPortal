import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { OWNER_ROLE_KEY } from "@/lib/permissions/roles";
import {
  memberAccessSchema,
  memberRoleSchema,
  memberStatusSchema,
  memberUpdateSchema,
  type InviteMemberInput,
  type MemberAccessInput,
  type MemberRoleInput,
  type MemberStatusInput,
  type MemberUpdateInput,
} from "@/lib/validation/settings";
import { createInvitation, listInvitations, revokeInvitation } from "./invitation-service";

async function loadMember(ctx: TenantContext, id: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      role: { select: { id: true, key: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
      hostelAccess: { select: { hostelId: true } },
    },
  });
  if (!member) throw new NotFoundError("Member");
  return member;
}

async function activeOwnerCount(organizationId: string) {
  return prisma.organizationMember.count({ where: { organizationId, isOwner: true, status: "ACTIVE" } });
}

/** Every member of the organization with role and hostel access. */
export async function listMembers(ctx: TenantContext) {
  requirePermission(ctx, "settings.members");
  const [members, hostelCount] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        isOwner: true,
        allHostels: true,
        createdAt: true,
        role: { select: { id: true, key: true, name: true } },
        user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
        hostelAccess: { select: { hostel: { select: { id: true, name: true, code: true, archivedAt: true } } } },
      },
    }),
    prisma.hostel.count({ where: { organizationId: ctx.organizationId, archivedAt: null } }),
  ]);
  return {
    hostelCount,
    members: members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      lastLoginAt: m.user.lastLoginAt,
      status: m.status,
      isOwner: m.isOwner,
      isSelf: m.user.id === ctx.userId,
      allHostels: m.allHostels || m.isOwner,
      hostels: m.hostelAccess
        .map((a) => a.hostel)
        .filter((h) => !h.archivedAt)
        .map((h) => ({ id: h.id, name: h.name, code: h.code })),
      /** Kept when access is edited so history in archived hostels stays visible. */
      archivedHostelIds: m.hostelAccess.filter((a) => a.hostel.archivedAt).map((a) => a.hostel.id),
      role: { id: m.role.id, name: m.role.name, isOwnerRole: m.role.key === OWNER_ROLE_KEY },
      joinedAt: m.createdAt,
    })),
  };
}

/** Roles and hostels for member/invite forms. */
export async function getMemberFormOptions(ctx: TenantContext) {
  requirePermission(ctx, "settings.members");
  const [roles, hostels] = await Promise.all([
    prisma.role.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      select: { id: true, key: true, name: true, description: true, defaultAllHostels: true },
    }),
    prisma.hostel.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, city: true },
    }),
  ]);
  return {
    roles: roles
      // Only owners may hand out the Owner role.
      .filter((r) => ctx.isOwner || r.key !== OWNER_ROLE_KEY)
      .map((r) => ({ ...r, isOwnerRole: r.key === OWNER_ROLE_KEY })),
    hostels,
  };
}

export async function changeMemberRole(ctx: TenantContext, memberId: string, raw: MemberRoleInput) {
  requirePermission(ctx, "settings.members");
  const input = parseInput(memberRoleSchema, raw);
  const member = await loadMember(ctx, memberId);
  const role = await prisma.role.findFirst({ where: { id: input.roleId, organizationId: ctx.organizationId } });
  if (!role) throw new NotFoundError("Role");
  if (role.id === member.roleId) return { id: member.id };

  const grantsOwner = role.key === OWNER_ROLE_KEY;
  if (member.isOwner && !ctx.isOwner) throw new ForbiddenError("Only an owner can change an owner's role.");
  if (grantsOwner && !ctx.isOwner) throw new ForbiddenError("Only an owner can grant the Owner role.");
  if (member.isOwner && !grantsOwner && member.status === "ACTIVE" && (await activeOwnerCount(ctx.organizationId)) <= 1) {
    throw new BusinessRuleError(
      member.userId === ctx.userId
        ? "You're the only owner. Make another member an owner before changing your own role."
        : "The organization must keep at least one owner.",
    );
  }
  if (member.userId === ctx.userId && !ctx.isOwner) {
    throw new BusinessRuleError("You can't change your own role. Ask an owner or another administrator.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({
      where: { id: member.id },
      data: {
        roleId: role.id,
        isOwner: grantsOwner,
        // Owners always see every hostel.
        ...(grantsOwner ? { allHostels: true } : {}),
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "member.role_changed",
        entityType: "OrganizationMember",
        entityId: member.id,
        before: { role: member.role.key, roleName: member.role.name, isOwner: member.isOwner },
        after: { role: role.key, roleName: role.name, isOwner: grantsOwner },
        metadata: { email: member.user.email },
      },
      tx,
    );
  });
  return { id: member.id };
}

export async function updateMemberHostelAccess(ctx: TenantContext, memberId: string, raw: MemberAccessInput) {
  requirePermission(ctx, "settings.members");
  const input = parseInput(memberAccessSchema, raw);
  const member = await loadMember(ctx, memberId);
  if (member.isOwner) throw new BusinessRuleError("Owners always have access to every hostel.");

  const hostelIds = input.allHostels ? [] : [...new Set(input.hostelIds)];
  if (!input.allHostels) {
    const count = await prisma.hostel.count({ where: { id: { in: hostelIds }, organizationId: ctx.organizationId } });
    if (count !== hostelIds.length) throw new NotFoundError("Hostel");
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({ where: { id: member.id }, data: { allHostels: input.allHostels } });
    await tx.memberHostelAccess.deleteMany({ where: { memberId: member.id } });
    if (hostelIds.length) {
      await tx.memberHostelAccess.createMany({ data: hostelIds.map((hostelId) => ({ memberId: member.id, hostelId })) });
    }
    await audit(
      actorOf(ctx),
      {
        action: "member.access_changed",
        entityType: "OrganizationMember",
        entityId: member.id,
        before: { allHostels: member.allHostels, hostelIds: member.hostelAccess.map((a) => a.hostelId) },
        after: { allHostels: input.allHostels, hostelIds },
        metadata: { email: member.user.email },
      },
      tx,
    );
  });
  return { id: member.id };
}

export async function setMemberStatus(ctx: TenantContext, memberId: string, raw: MemberStatusInput) {
  requirePermission(ctx, "settings.members");
  const input = parseInput(memberStatusSchema, raw);
  const member = await loadMember(ctx, memberId);
  if (member.userId === ctx.userId) throw new BusinessRuleError("You can't change the status of your own membership.");
  if (member.isOwner) throw new BusinessRuleError("Owners can't be suspended.");
  if (member.status === input.status) return { id: member.id };
  if (member.status === "INVITED") throw new BusinessRuleError("This person hasn't joined yet.");

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({ where: { id: member.id }, data: { status: input.status } });
    await audit(
      actorOf(ctx),
      {
        action: input.status === "SUSPENDED" ? "member.suspended" : "member.reactivated",
        entityType: "OrganizationMember",
        entityId: member.id,
        before: { status: member.status },
        after: { status: input.status },
        metadata: { email: member.user.email },
      },
      tx,
    );
  });
  return { id: member.id };
}

/** Remove someone from the organization. Their user account and history remain. */
export async function removeMember(ctx: TenantContext, memberId: string) {
  requirePermission(ctx, "settings.members");
  const member = await loadMember(ctx, memberId);
  if (member.userId === ctx.userId) throw new BusinessRuleError("You can't remove yourself from the organization.");
  if (member.isOwner) throw new BusinessRuleError("Owners can't be removed. Change their role first.");

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.delete({ where: { id: member.id } });
    await audit(
      actorOf(ctx),
      {
        action: "member.removed",
        entityType: "OrganizationMember",
        entityId: member.id,
        before: {
          email: member.user.email,
          name: member.user.name,
          role: member.role.key,
          allHostels: member.allHostels,
          hostelIds: member.hostelAccess.map((a) => a.hostelId),
        },
      },
      tx,
    );
  });
}

/** Apply a REST PATCH that may combine role, hostel access and status changes. */
export async function updateMember(ctx: TenantContext, memberId: string, raw: MemberUpdateInput) {
  requirePermission(ctx, "settings.members");
  const input = parseInput(memberUpdateSchema, raw);
  if (input.roleId !== undefined) await changeMemberRole(ctx, memberId, { roleId: input.roleId });
  if (input.allHostels !== undefined || input.hostelIds !== undefined) {
    const current = await loadMember(ctx, memberId);
    await updateMemberHostelAccess(ctx, memberId, {
      allHostels: input.allHostels ?? current.allHostels,
      hostelIds: input.hostelIds ?? current.hostelAccess.map((a) => a.hostelId),
    });
  }
  if (input.status !== undefined) await setMemberStatus(ctx, memberId, { status: input.status });
  return { id: memberId };
}

// ─── Invitations (delegates to the invitation service) ──────────────────────

export async function listPendingInvitations(ctx: TenantContext) {
  const invitations = await listInvitations(ctx);
  const hostelIds = [...new Set(invitations.flatMap((i) => i.hostelIds))];
  const hostels = hostelIds.length
    ? await prisma.hostel.findMany({
        where: { id: { in: hostelIds }, organizationId: ctx.organizationId },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(hostels.map((h) => [h.id, h.name]));
  const now = Date.now();
  return invitations.map((i) => ({
    daysLeft: Math.max(0, Math.ceil((i.expiresAt.getTime() - now) / 86400_000)),
    id: i.id,
    email: i.email,
    role: i.role,
    allHostels: i.allHostels,
    hostels: i.hostelIds.flatMap((id) => (names.has(id) ? [{ id, name: names.get(id)! }] : [])),
    invitedBy: i.invitedBy.name,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
  }));
}

export async function inviteMember(ctx: TenantContext, raw: InviteMemberInput) {
  return createInvitation(ctx, raw);
}

export async function cancelInvitation(ctx: TenantContext, invitationId: string) {
  await revokeInvitation(ctx, invitationId);
}
