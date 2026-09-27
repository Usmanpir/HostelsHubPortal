import "server-only";
import { prisma, type Tx } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import { accessWhere, actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { generateToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { sendEmail } from "@/lib/notifications/mailer";
import { fullName } from "@/lib/format";

const SETUP_TOKEN_TTL_HOURS = 72;

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function loadResident(ctx: TenantContext, residentId: string) {
  requirePermission(ctx, "residents.manage");
  const resident = await prisma.resident.findFirst({
    where: { id: residentId, ...accessWhere(ctx) },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, userId: true, status: true, archivedAt: true, residentCode: true },
  });
  if (!resident) throw new NotFoundError("Resident");
  return resident;
}

async function createSetupToken(tx: Tx, userId: string) {
  const { token, tokenHash } = generateToken();
  // Only the newest setup link should work.
  await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await tx.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_HOURS * 3600_000) },
  });
  return `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

async function sendSetupEmail(ctx: TenantContext, to: string, name: string, url: string) {
  const org = ctx.organization.brandName || ctx.organization.name;
  try {
    await sendEmail({
      to,
      fromName: org,
      subject: `Your ${org} resident portal account`,
      text: [
        `Hi ${name},`,
        "",
        `${org} has created a resident portal account for you. Use it to see your invoices, payments, notices and to raise requests.`,
        "",
        `Set your password here (the link expires in ${SETUP_TOKEN_TTL_HOURS} hours):`,
        url,
        "",
        "If you weren't expecting this email you can ignore it.",
      ].join("\n"),
    });
  } catch (error) {
    // The link is also shown to staff, so a mail outage doesn't block provisioning.
    console.error("[portal-access] email failed", error);
  }
}

/**
 * Give a resident a portal login. If a user with the resident's email already
 * exists it is simply linked; otherwise a new account with an unusable random
 * password is created and a 72-hour password setup link is emailed (and
 * returned once so staff can share it manually).
 */
export async function enablePortalAccess(ctx: TenantContext, residentId: string) {
  const resident = await loadResident(ctx, residentId);
  if (resident.archivedAt || resident.status === "ARCHIVED") throw new BusinessRuleError("Restore this resident before enabling portal access.");
  if (resident.userId) throw new BusinessRuleError("This resident already has portal access.");
  if (!resident.email) throw new BusinessRuleError("Add an email address to the resident's profile first.");
  const email = resident.email.toLowerCase();
  const name = fullName(resident);
  const unusablePassword = await hashPassword(generateToken().token);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      const clash = await tx.resident.findFirst({
        where: { organizationId: ctx.organizationId, userId: existing.id },
        select: { residentCode: true, firstName: true, lastName: true },
      });
      if (clash) {
        throw new ConflictError(`${email} is already linked to ${fullName(clash)} (${clash.residentCode}).`);
      }
      await tx.resident.update({ where: { id: resident.id }, data: { userId: existing.id } });
      await audit(actorOf(ctx), { action: "resident.portal_linked", entityType: "Resident", entityId: resident.id, after: { userId: existing.id, email } }, tx);
      return { created: false, setupUrl: null as string | null };
    }
    const user = await tx.user.create({
      data: { name, email, phone: resident.phone, passwordHash: unusablePassword },
      select: { id: true },
    });
    await tx.resident.update({ where: { id: resident.id }, data: { userId: user.id } });
    const setupUrl = await createSetupToken(tx, user.id);
    await audit(actorOf(ctx), { action: "resident.portal_enabled", entityType: "Resident", entityId: resident.id, after: { userId: user.id, email } }, tx);
    return { created: true, setupUrl };
  });

  if (result.setupUrl) await sendSetupEmail(ctx, email, resident.firstName, result.setupUrl);
  return { linkedExisting: !result.created, setupUrl: result.setupUrl, email };
}

/**
 * Issue a fresh setup link for a portal account that has never been used.
 * Refused for accounts that have signed in or belong to team members, so
 * staff can never take over someone else's login.
 */
export async function resendPortalSetupLink(ctx: TenantContext, residentId: string) {
  const resident = await loadResident(ctx, residentId);
  if (!resident.userId) throw new BusinessRuleError("Enable portal access first.");
  const user = await prisma.user.findUnique({
    where: { id: resident.userId },
    select: { id: true, email: true, lastLoginAt: true, isSuperAdmin: true, status: true, _count: { select: { memberships: true } } },
  });
  if (!user) throw new NotFoundError("Portal account");
  if (user.lastLoginAt || user.isSuperAdmin || user._count.memberships > 0 || user.status !== "ACTIVE") {
    throw new BusinessRuleError("This account is already in use. The resident can reset their own password from the sign-in page.");
  }
  const setupUrl = await prisma.$transaction(async (tx) => {
    const url = await createSetupToken(tx, user.id);
    await audit(actorOf(ctx), { action: "resident.portal_link_resent", entityType: "Resident", entityId: resident.id }, tx);
    return url;
  });
  await sendSetupEmail(ctx, user.email, resident.firstName, setupUrl);
  return { setupUrl, email: user.email };
}

/** Unlink the login. The user account itself is kept (it may be used elsewhere). */
export async function revokePortalAccess(ctx: TenantContext, residentId: string) {
  const resident = await loadResident(ctx, residentId);
  if (!resident.userId) throw new BusinessRuleError("This resident doesn't have portal access.");
  await prisma.$transaction(async (tx) => {
    await tx.resident.update({ where: { id: resident.id }, data: { userId: null } });
    await audit(actorOf(ctx), { action: "resident.portal_revoked", entityType: "Resident", entityId: resident.id, before: { userId: resident.userId } }, tx);
  });
}
