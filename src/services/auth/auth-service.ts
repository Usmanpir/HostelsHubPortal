import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/notifications/mailer";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { parseInput } from "@/lib/validation/parse";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  inviteSignupSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type InviteSignupInput,
  type ProfileInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "@/lib/validation/auth";
import { APP_NAME } from "@/config/defaults";

/**
 * Account lifecycle for platform users: registration, email verification,
 * password reset/change and profile. These functions run before a tenant
 * context exists, so they take the user id / request metadata explicitly.
 */

export type RequestMeta = { ipAddress?: string | null; userAgent?: string | null };

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function emailVerificationRequired() {
  return process.env.REQUIRE_EMAIL_VERIFICATION === "true";
}

// ─── Registration & verification ─────────────────────────────────────────────

/** Create a new account. Duplicate emails get a clear (sign-in) hint. */
export async function registerUser(raw: RegisterInput, meta: RequestMeta = {}) {
  const input = parseInput(registerSchema, raw);
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new ConflictError("An account with this email already exists. Sign in instead.");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: { id: true, email: true, name: true },
    });
    await recordAudit(
      {
        userId: created.id,
        action: "auth.registered",
        entityType: "User",
        entityId: created.id,
        after: { email: created.email, plan: input.plan ?? null },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      tx,
    );
    return created;
  });

  await sendVerificationEmail(user.id).catch((e) => console.error("[auth] verification email failed", e));
  return { id: user.id, email: user.email, verificationRequired: emailVerificationRequired() };
}

/** Deferred email delivery, so callers can send after responding (keeps timing uniform). */
export type EmailJob = () => Promise<void>;

/**
 * Create a verification token (24h), invalidating earlier ones, and return
 * the job that emails the link. Null when the account needs no verification.
 */
async function prepareVerificationEmail(userId: string): Promise<EmailJob | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerifiedAt: true, status: true },
  });
  if (!user || user.emailVerifiedAt || user.status !== "ACTIVE") return null;

  const { token, tokenHash } = generateToken();
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
    }),
  ]);
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return () =>
    sendEmail({
      to: user.email,
      subject: `Verify your email for ${APP_NAME}`,
      text: `Hi ${user.name},\n\nConfirm your email address to secure your ${APP_NAME} account:\n${link}\n\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email.`,
    }).catch((e) => console.error("[auth] verification email failed", e));
}

/** Create a verification token and email the link now. */
export async function sendVerificationEmail(userId: string) {
  const job = await prepareVerificationEmail(userId);
  if (job) await job();
}

/**
 * Resend a verification link. Unknown or already-verified emails silently
 * get nothing; the returned job (if any) should run after the response.
 */
export async function resendVerification(raw: ForgotPasswordInput): Promise<EmailJob | null> {
  const { email } = parseInput(forgotPasswordSchema, raw);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user ? prepareVerificationEmail(user.id) : null;
}

export type VerifyEmailResult = "verified" | "already_verified" | "invalid";

export async function verifyEmail(rawToken: string, meta: RequestMeta = {}): Promise<VerifyEmailResult> {
  const parsed = verifyEmailSchema.safeParse({ token: rawToken });
  if (!parsed.success) return "invalid";
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: { user: { select: { id: true, emailVerifiedAt: true } } },
  });
  if (!record) return "invalid";
  if (record.user.emailVerifiedAt) return "already_verified";
  if (record.usedAt || record.expiresAt < new Date()) return "invalid";

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    await recordAudit(
      {
        userId: record.userId,
        action: "auth.email_verified",
        entityType: "User",
        entityId: record.userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      tx,
    );
  });
  return "verified";
}

// ─── Password reset ──────────────────────────────────────────────────────────

/**
 * Create a 1-hour reset link and return the job that emails it. Resolves the
 * same way whether or not the email exists; run the job after responding so
 * timing doesn't reveal which addresses have accounts.
 */
export async function requestPasswordReset(raw: ForgotPasswordInput, meta: RequestMeta = {}): Promise<EmailJob | null> {
  const { email } = parseInput(forgotPasswordSchema, raw);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, status: true } });
  if (!user || user.status !== "ACTIVE") return null;

  const { token, tokenHash } = generateToken();
  await prisma.$transaction(async (tx) => {
    // Only the newest link works.
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    await recordAudit(
      {
        userId: user.id,
        action: "auth.password_reset_requested",
        entityType: "User",
        entityId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      tx,
    );
  });

  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return () =>
    sendEmail({
      to: user.email,
      subject: `Reset your ${APP_NAME} password`,
      text: `Hi ${user.name},\n\nWe received a request to reset your password. Choose a new one here:\n${link}\n\nThis link expires in 1 hour and can be used once. If you didn't ask for this, you can safely ignore this email — your password won't change.`,
    }).catch((e) => console.error("[auth] reset email failed", e));
}

export type ResetTokenState =
  | { valid: false }
  | { valid: true; email: string; name: string; mode: "set" | "reset"; expiresAt: Date };

/**
 * Inspect a reset link for the reset page. Tokens are also used for resident
 * portal first-time setup — accounts that have never signed in get "set"
 * copy instead of "reset".
 */
export async function getPasswordResetTokenState(rawToken: string | undefined): Promise<ResetTokenState> {
  if (!rawToken || rawToken.length < 10 || rawToken.length > 200) return { valid: false };
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { select: { email: true, name: true, status: true, lastLoginAt: true } } },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.status !== "ACTIVE") return { valid: false };
  return {
    valid: true,
    email: record.user.email,
    name: record.user.name,
    mode: record.user.lastLoginAt ? "reset" : "set",
    expiresAt: record.expiresAt,
  };
}

/**
 * Set a new password from a reset link: marks the token used, clears any
 * lockout and bumps sessionVersion so every existing session is signed out.
 */
export async function resetPassword(raw: ResetPasswordInput, meta: RequestMeta = {}) {
  const input = parseInput(resetPasswordSchema, raw);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { user: { select: { id: true, status: true, email: true, lastLoginAt: true } } },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.status !== "ACTIVE") {
    throw new BusinessRuleError("This link is invalid or has expired. Request a new one.");
  }
  const passwordHash = await hashPassword(input.password);
  const firstTime = !record.user.lastLoginAt;

  await prisma.$transaction(async (tx) => {
    // Conditional update guards against the same token being redeemed twice concurrently.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new BusinessRuleError("This link has already been used. Request a new one.");
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
        // Receiving the link proves ownership of the address.
        emailVerifiedAt: new Date(),
      },
    });
    await recordAudit(
      {
        userId: record.userId,
        action: firstTime ? "auth.password_set" : "auth.password_reset",
        entityType: "User",
        entityId: record.userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      tx,
    );
  });
  return { userId: record.userId, email: record.user.email, firstTime };
}

// ─── Account (signed in) ─────────────────────────────────────────────────────

export async function getAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      memberships: {
        where: { status: "ACTIVE", organization: { deletedAt: null } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          isOwner: true,
          allHostels: true,
          createdAt: true,
          role: { select: { name: true } },
          organization: { select: { id: true, name: true, status: true, city: true, country: true } },
          _count: { select: { hostelAccess: true } },
        },
      },
    },
  });
  if (!user) throw new NotFoundError("Account");
  return user;
}

export async function updateProfile(userId: string, raw: ProfileInput, meta: RequestMeta = {}) {
  const input = parseInput(profileSchema, raw);
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } });
  if (!before) throw new NotFoundError("Account");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { name: input.name, phone: input.phone ?? null },
      select: { id: true, name: true, phone: true },
    });
    await recordAudit(
      {
        userId,
        action: "account.profile_updated",
        entityType: "User",
        entityId: userId,
        before,
        after: { name: user.name, phone: user.phone },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      tx,
    );
    return user;
  });
}

/** Change password after re-checking the current one; invalidates all sessions. */
export async function changePassword(userId: string, raw: ChangePasswordInput, meta: RequestMeta = {}) {
  const input = parseInput(changePasswordSchema, raw);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true, status: true } });
  if (!user || user.status !== "ACTIVE") throw new NotFoundError("Account");
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new ValidationError("Your current password is incorrect.", { currentPassword: ["Your current password is incorrect"] });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null },
    });
    // Outstanding reset links would otherwise still work.
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    await recordAudit(
      {
        userId,
        action: "auth.password_changed",
        entityType: "User",
        entityId: userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      tx,
    );
  });
}

// ─── Invitations ─────────────────────────────────────────────────────────────

/**
 * Create the account for someone accepting an invitation. The email is taken
 * from the invitation itself (never from the form) and is considered verified
 * because the person received the invite link.
 */
export async function registerInvitedUser(raw: InviteSignupInput, meta: RequestMeta = {}) {
  const input = parseInput(inviteSignupSchema, raw);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: { email: true, organizationId: true, acceptedAt: true, revokedAt: true, expiresAt: true },
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
    throw new BusinessRuleError("This invitation is invalid or has expired. Ask for a new one.");
  }
  const email = invitation.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new ConflictError("An account with this email already exists. Sign in to accept the invitation.");

  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email, passwordHash, emailVerifiedAt: new Date() },
      select: { id: true, email: true },
    });
    await recordAudit(
      {
        organizationId: invitation.organizationId,
        userId: user.id,
        action: "auth.registered",
        entityType: "User",
        entityId: user.id,
        after: { email, via: "invitation" },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      tx,
    );
    return user;
  });
}
