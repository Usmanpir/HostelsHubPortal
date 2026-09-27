import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { audit, recordAudit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { emailSchema } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/notifications/mailer";
import { OWNER_ROLE_KEY } from "@/lib/permissions/roles";

const INVITE_TTL_DAYS = 7;

export const inviteSchema = z.object({
  email: emailSchema,
  roleId: z.string().min(1, "Select a role"),
  allHostels: z.boolean().default(false),
  hostelIds: z.array(z.string().min(1)).max(200).default([]),
});
export type InviteInput = z.input<typeof inviteSchema>;

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Invite a teammate by email. Returns the accept link (also emailed). */
export async function createInvitation(ctx: TenantContext, raw: InviteInput) {
  requirePermission(ctx, "settings.members");
  const input = parseInput(inviteSchema, raw);

  const role = await prisma.role.findFirst({ where: { id: input.roleId, organizationId: ctx.organizationId } });
  if (!role) throw new NotFoundError("Role");
  if (role.key === OWNER_ROLE_KEY && !ctx.isOwner) throw new BusinessRuleError("Only the owner can invite another owner.");

  const hostelIds = input.allHostels ? [] : [...new Set(input.hostelIds)];
  if (!input.allHostels) {
    if (hostelIds.length === 0) throw new ValidationError("Select at least one hostel or grant access to all hostels.", { hostelIds: ["Select at least one hostel"] });
    const count = await prisma.hostel.count({ where: { id: { in: hostelIds }, organizationId: ctx.organizationId } });
    if (count !== hostelIds.length) throw new NotFoundError("Hostel");
  }

  const existingMember = await prisma.organizationMember.findFirst({
    where: { organizationId: ctx.organizationId, user: { email: input.email } },
    select: { id: true },
  });
  if (existingMember) throw new ConflictError("This person is already a member of your organization.");

  const { token, tokenHash } = generateToken();
  const invitation = await prisma.$transaction(async (tx) => {
    // Supersede any earlier pending invite to the same address.
    await tx.invitation.updateMany({
      where: { organizationId: ctx.organizationId, email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const inv = await tx.invitation.create({
      data: {
        organizationId: ctx.organizationId,
        email: input.email,
        roleId: role.id,
        allHostels: input.allHostels,
        hostelIds,
        tokenHash,
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000),
      },
    });
    await audit(actorOf(ctx), { action: "member.invited", entityType: "Invitation", entityId: inv.id, after: { email: input.email, role: role.key, allHostels: input.allHostels, hostelIds } }, tx);
    return inv;
  });

  const inviteUrl = `${appUrl()}/invite/${token}`;
  await sendEmail({
    to: input.email,
    subject: `You're invited to join ${ctx.organization.brandName ?? ctx.organization.name}`,
    text: `${ctx.userName} invited you to join ${ctx.organization.name} as ${role.name}.\n\nAccept the invitation: ${inviteUrl}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    fromName: ctx.organization.brandName ?? ctx.organization.name,
  }).catch((e) => console.error("[invite] email failed", e));

  return { id: invitation.id, inviteUrl };
}

export async function listInvitations(ctx: TenantContext) {
  requirePermission(ctx, "settings.members");
  return prisma.invitation.findMany({
    where: { organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      allHostels: true,
      hostelIds: true,
      expiresAt: true,
      createdAt: true,
      role: { select: { id: true, name: true } },
      invitedBy: { select: { name: true } },
    },
  });
}

export async function revokeInvitation(ctx: TenantContext, id: string) {
  requirePermission(ctx, "settings.members");
  const inv = await prisma.invitation.findFirst({ where: { id, organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null } });
  if (!inv) throw new NotFoundError("Invitation");
  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(actorOf(ctx), { action: "member.invite_revoked", entityType: "Invitation", entityId: id, after: { email: inv.email } }, tx);
  });
}

/** Public lookup for the accept page. Returns null when invalid/expired. */
export async function getInvitationByToken(token: string) {
  if (!token || token.length > 200) return null;
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: { select: { id: true, name: true, brandName: true, status: true } },
      role: { select: { name: true } },
      invitedBy: { select: { name: true } },
    },
  });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date() || inv.organization.status !== "ACTIVE") return null;
  const existingUser = await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });
  return { ...inv, hasAccount: !!existingUser };
}

/**
 * Accept an invitation as `userId`. The signed-in user's email must match the
 * invited address, so a leaked link can't be used by someone else's account.
 */
export async function acceptInvitation(userId: string, token: string) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
    throw new BusinessRuleError("This invitation is invalid or has expired. Ask for a new one.");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  if (user.email.toLowerCase() !== inv.email.toLowerCase()) {
    throw new BusinessRuleError(`This invitation was sent to ${inv.email}. Sign in with that email to accept it.`);
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: inv.organizationId, userId } },
    });
    if (existing) throw new ConflictError("You're already a member of this organization.");
    const role = await tx.role.findUniqueOrThrow({ where: { id: inv.roleId } });
    const validHostels = inv.allHostels
      ? []
      : (await tx.hostel.findMany({ where: { id: { in: inv.hostelIds }, organizationId: inv.organizationId }, select: { id: true } })).map((h) => h.id);
    const member = await tx.organizationMember.create({
      data: {
        organizationId: inv.organizationId,
        userId,
        roleId: role.id,
        allHostels: inv.allHostels,
        isOwner: role.key === OWNER_ROLE_KEY,
        hostelAccess: { create: validHostels.map((hostelId) => ({ hostelId })) },
      },
    });
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await recordAudit(
      { organizationId: inv.organizationId, userId, action: "member.joined", entityType: "OrganizationMember", entityId: member.id, after: { role: role.key } },
      tx,
    );
    return { organizationId: inv.organizationId };
  });
}
