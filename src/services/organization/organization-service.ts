import { z } from "zod";
import type { DbClient, Db } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit";
import { ROLE_TEMPLATES, OWNER_ROLE_KEY } from "@/lib/permissions/roles";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/config/defaults";
import { TRIAL_PLAN_KEY } from "@/config/plans";
import { optionalEmail, optionalPhone, optionalText, requiredText } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import { NotFoundError } from "@/lib/errors";

export const organizationProfileSchema = z.object({
  name: requiredText("Organization name", 120),
  email: optionalEmail,
  phone: optionalPhone,
  address: optionalText(300),
  city: optionalText(100),
  country: optionalText(100),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").toUpperCase().default("PKR"),
  timezone: z.string().trim().min(1).max(64).default("Asia/Karachi"),
});
export type OrganizationProfileInput = z.input<typeof organizationProfileSchema>;

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 48) || "org"
  );
}

async function uniqueSlug(db: DbClient, name: string) {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const exists = await db.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Create the system roles (from templates) for a new organization. */
export async function createSystemRoles(db: DbClient, organizationId: string) {
  const roles: Record<string, string> = {};
  for (const template of ROLE_TEMPLATES) {
    const role = await db.role.create({
      data: {
        organizationId,
        key: template.key,
        name: template.name,
        description: template.description,
        isSystem: true,
        defaultAllHostels: template.defaultAllHostels,
        permissions: { create: template.permissions.map((permission) => ({ permission })) },
      },
    });
    roles[template.key] = role.id;
  }
  return roles;
}

/**
 * Provision a new tenant: organization, system roles, owner membership,
 * trial subscription and default expense categories — atomically.
 */
export async function createOrganizationForUser(
  db: Db,
  userId: string,
  rawInput: OrganizationProfileInput,
  options: { planKey?: string; ipAddress?: string | null } = {},
) {
  const input = parseInput(organizationProfileSchema, rawInput);
  return db.$transaction(async (tx) => {
    const plan =
      (await tx.plan.findUnique({ where: { key: options.planKey ?? TRIAL_PLAN_KEY } })) ??
      (await tx.plan.findUnique({ where: { key: TRIAL_PLAN_KEY } }));
    if (!plan) throw new NotFoundError("Subscription plan");

    const organization = await tx.organization.create({
      data: { ...input, slug: await uniqueSlug(tx, input.name) },
    });
    const roles = await createSystemRoles(tx, organization.id);
    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId,
        roleId: roles[OWNER_ROLE_KEY]!,
        isOwner: true,
        allHostels: true,
      },
    });

    const now = new Date();
    const trialDays = plan.trialDays > 0 ? plan.trialDays : 14;
    const trialEndsAt = new Date(now.getTime() + trialDays * 86400_000);
    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        planId: plan.id,
        status: "TRIALING",
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      },
    });

    await tx.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ organizationId: organization.id, ...c, isSystem: true })),
    });

    await recordAudit(
      {
        organizationId: organization.id,
        userId,
        action: "organization.created",
        entityType: "Organization",
        entityId: organization.id,
        after: { name: organization.name, plan: plan.key },
        ipAddress: options.ipAddress,
      },
      tx,
    );
    return organization;
  });
}
