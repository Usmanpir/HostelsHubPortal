import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { ConflictError, NotFoundError, PlanLimitError } from "@/lib/errors";
import { actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { hasFeature } from "@/lib/subscription/limits";
import { PLAN_FEATURES } from "@/config/plans";
import { serialize, toNumber } from "@/lib/serialize";
import { claimUpload } from "@/services/files/file-service";
import {
  brandingSchema,
  invoiceSettingsSchema,
  notificationSettingsSchema,
  organizationSettingsSchema,
  type BrandingInput,
  type InvoiceSettingsInput,
  type NotificationSettings,
  type NotificationSettingsInput,
  type OrganizationSettingsInput,
} from "@/lib/validation/settings";

const orgSelect = {
  id: true,
  name: true,
  slug: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  country: true,
  currency: true,
  timezone: true,
  locale: true,
  logoFileId: true,
  brandName: true,
  primaryColor: true,
  customDomain: true,
  emailSenderName: true,
  emailSenderAddress: true,
  invoicePrefix: true,
  receiptPrefix: true,
  invoiceDueDays: true,
  taxRate: true,
  taxLabel: true,
  invoiceFooter: true,
  notificationSettings: true,
  logo: { select: { id: true, originalName: true, size: true, mimeType: true } },
} satisfies Prisma.OrganizationSelect;

async function loadOrganization(ctx: TenantContext) {
  const org = await prisma.organization.findFirst({
    where: { id: ctx.organizationId, deletedAt: null },
    select: orgSelect,
  });
  if (!org) throw new NotFoundError("Organization");
  return org;
}

/** Parse the stored JSON leniently; unknown/missing keys fall back to defaults. */
export function readNotificationSettings(json: Prisma.JsonValue | null | undefined): NotificationSettings {
  const parsed = notificationSettingsSchema.safeParse(json && typeof json === "object" && !Array.isArray(json) ? json : {});
  return parsed.success ? parsed.data : notificationSettingsSchema.parse({});
}

function jsonObject(json: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, Prisma.JsonValue>) : {};
}

/** Everything the settings screens need about the current organization. */
export async function getOrganizationSettings(ctx: TenantContext) {
  requirePermission(ctx, "settings.organization");
  const [org, branding, emailNotifications] = await Promise.all([
    loadOrganization(ctx),
    hasFeature(prisma, ctx.organizationId, PLAN_FEATURES.customBranding),
    hasFeature(prisma, ctx.organizationId, PLAN_FEATURES.emailNotifications),
  ]);
  return serialize({
    profile: {
      name: org.name,
      slug: org.slug,
      email: org.email,
      phone: org.phone,
      address: org.address,
      city: org.city,
      country: org.country,
      currency: org.currency,
      timezone: org.timezone,
      locale: org.locale,
      logo: org.logo ? { id: org.logo.id, name: org.logo.originalName, size: org.logo.size, mimeType: org.logo.mimeType } : null,
    },
    branding: {
      brandName: org.brandName,
      primaryColor: org.primaryColor,
      customDomain: org.customDomain,
      emailSenderName: org.emailSenderName,
      emailSenderAddress: org.emailSenderAddress,
    },
    invoice: {
      invoicePrefix: org.invoicePrefix,
      receiptPrefix: org.receiptPrefix,
      invoiceDueDays: org.invoiceDueDays,
      taxRate: toNumber(org.taxRate),
      taxLabel: org.taxLabel,
      invoiceFooter: org.invoiceFooter,
    },
    notifications: readNotificationSettings(org.notificationSettings),
    features: { branding, emailNotifications },
  });
}

export async function updateOrganizationProfile(ctx: TenantContext, raw: OrganizationSettingsInput) {
  requirePermission(ctx, "settings.organization");
  const input = parseInput(organizationSettingsSchema, raw);
  const before = await loadOrganization(ctx);
  const { logoFileId, ...profile } = input;

  return prisma.$transaction(async (tx) => {
    let nextLogoId = before.logoFileId;
    if (logoFileId === null) nextLogoId = null;
    else if (logoFileId && logoFileId !== before.logoFileId) {
      const file = await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, logoFileId, ["organization-logo"]);
      nextLogoId = file.id;
    }

    const data = {
      name: profile.name,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      address: profile.address ?? null,
      city: profile.city ?? null,
      country: profile.country ?? null,
      currency: profile.currency,
      timezone: profile.timezone,
      locale: profile.locale,
      logoFileId: nextLogoId,
    };
    const updated = await tx.organization.update({ where: { id: ctx.organizationId }, data, select: orgSelect });

    // The replaced logo is no longer referenced; mark it deleted so it stops counting towards storage.
    if (before.logoFileId && before.logoFileId !== nextLogoId) {
      await tx.storedFile.updateMany({
        where: { id: before.logoFileId, organizationId: ctx.organizationId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }

    const pick = (o: typeof before) => ({
      name: o.name,
      email: o.email,
      phone: o.phone,
      address: o.address,
      city: o.city,
      country: o.country,
      currency: o.currency,
      timezone: o.timezone,
      locale: o.locale,
      logoFileId: o.logoFileId,
    });
    await audit(
      actorOf(ctx),
      {
        action: "settings.organization_updated",
        entityType: "Organization",
        entityId: ctx.organizationId,
        before: pick(before),
        after: pick(updated),
        metadata: before.currency !== updated.currency ? { currencyChanged: true } : undefined,
      },
      tx,
    );
    return { id: updated.id };
  });
}

export async function updateBranding(ctx: TenantContext, raw: BrandingInput) {
  requirePermission(ctx, "settings.organization");
  const input = parseInput(brandingSchema, raw);
  const hasValues = Object.values(input).some((v) => v !== undefined);
  // Clearing branding is always allowed (e.g. after a downgrade); setting it needs the plan feature.
  if (hasValues && !(await hasFeature(prisma, ctx.organizationId, PLAN_FEATURES.customBranding))) {
    throw new PlanLimitError("Custom branding isn't included in your plan. Upgrade to use your own name, colours and domain.");
  }
  const before = await loadOrganization(ctx);
  if (input.customDomain && input.customDomain !== before.customDomain) {
    const clash = await prisma.organization.findFirst({
      where: { customDomain: input.customDomain, id: { not: ctx.organizationId } },
      select: { id: true },
    });
    if (clash) throw new ConflictError("This domain is already connected to another organization.");
  }
  const data = {
    brandName: input.brandName ?? null,
    primaryColor: input.primaryColor ?? null,
    customDomain: input.customDomain ?? null,
    emailSenderName: input.emailSenderName ?? null,
    emailSenderAddress: input.emailSenderAddress ?? null,
  };
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: ctx.organizationId }, data });
    await audit(
      actorOf(ctx),
      {
        action: "settings.branding_updated",
        entityType: "Organization",
        entityId: ctx.organizationId,
        before: {
          brandName: before.brandName,
          primaryColor: before.primaryColor,
          customDomain: before.customDomain,
          emailSenderName: before.emailSenderName,
          emailSenderAddress: before.emailSenderAddress,
        },
        after: data,
      },
      tx,
    );
  });
  return data;
}

export async function updateInvoiceSettings(ctx: TenantContext, raw: InvoiceSettingsInput) {
  requirePermission(ctx, "settings.organization");
  const input = parseInput(invoiceSettingsSchema, raw);
  const before = await loadOrganization(ctx);
  const data = {
    invoicePrefix: input.invoicePrefix,
    receiptPrefix: input.receiptPrefix,
    invoiceDueDays: input.invoiceDueDays,
    taxRate: input.taxRate,
    taxLabel: input.taxLabel ?? null,
    invoiceFooter: input.invoiceFooter ?? null,
  };
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: ctx.organizationId }, data });
    await audit(
      actorOf(ctx),
      {
        action: "settings.invoice_updated",
        entityType: "Organization",
        entityId: ctx.organizationId,
        before: {
          invoicePrefix: before.invoicePrefix,
          receiptPrefix: before.receiptPrefix,
          invoiceDueDays: before.invoiceDueDays,
          taxRate: toNumber(before.taxRate),
          taxLabel: before.taxLabel,
          invoiceFooter: before.invoiceFooter,
        },
        after: data,
      },
      tx,
    );
  });
  return data;
}

export async function updateNotificationSettings(ctx: TenantContext, raw: NotificationSettingsInput) {
  requirePermission(ctx, "settings.organization");
  const input = parseInput(notificationSettingsSchema, raw);
  if (input.email && !(await hasFeature(prisma, ctx.organizationId, PLAN_FEATURES.emailNotifications))) {
    throw new PlanLimitError("Email notifications aren't included in your plan. Upgrade to send notification emails.");
  }
  const before = await loadOrganization(ctx);
  const previous = readNotificationSettings(before.notificationSettings);
  // Preserve keys managed elsewhere (e.g. future SMS/WhatsApp toggles).
  const next = { ...jsonObject(before.notificationSettings), email: input.email, events: input.events };
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { notificationSettings: next as Prisma.InputJsonValue },
    });
    await audit(
      actorOf(ctx),
      {
        action: "settings.notifications_updated",
        entityType: "Organization",
        entityId: ctx.organizationId,
        before: previous,
        after: input,
      },
      tx,
    );
  });
  return input;
}

// ─── Hostel settings index ──────────────────────────────────────────────────

/** Hostels the member can configure, for the "Hostel settings" section. */
export async function listHostelSettings(ctx: TenantContext) {
  requirePermission(ctx, "hostels.manage");
  const rows = await prisma.hostel.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      ...(ctx.allHostels ? {} : { id: { in: ctx.accessibleHostelIds } }),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      status: true,
      defaultBedRent: true,
      rentDueDay: true,
      lateFeeAmount: true,
      updatedAt: true,
    },
  });
  return serialize(rows);
}

// ─── Security ───────────────────────────────────────────────────────────────

/**
 * Invalidate every session of the current user (all devices, including this
 * one) by bumping `sessionVersion`; session cookies carry the version they
 * were issued with and are rejected once it changes.
 */
export async function signOutAllSessions(ctx: TenantContext) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ctx.userId }, data: { sessionVersion: { increment: 1 } } });
    await audit(actorOf(ctx), { action: "auth.sessions_revoked", entityType: "User", entityId: ctx.userId }, tx);
  });
}

export async function getSecurityOverview(ctx: TenantContext) {
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { lastLoginAt: true, createdAt: true, email: true, emailVerifiedAt: true },
  });
  if (!user) throw new NotFoundError("User");
  return user;
}

/**
 * Recent sign-ins by members of this organization. Login events are
 * user-level (recorded before an organization is chosen), so they are
 * matched by the organization's member user ids.
 */
export async function listRecentSignIns(ctx: TenantContext, options: { limit?: number } = {}) {
  requirePermission(ctx, "audit.view");
  const take = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: ctx.organizationId },
    select: { userId: true },
  });
  const userIds = members.map((m) => m.userId);
  if (userIds.length === 0) return [];
  return prisma.auditLog.findMany({
    where: {
      action: "auth.login",
      userId: { in: userIds },
      OR: [{ organizationId: null }, { organizationId: ctx.organizationId }],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      createdAt: true,
      ipAddress: true,
      userAgent: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}
