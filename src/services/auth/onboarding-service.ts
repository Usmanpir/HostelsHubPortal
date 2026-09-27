import "server-only";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { actorOf, loadTenantContext, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { serialize } from "@/lib/serialize";
import { OWNER_ROLE_KEY } from "@/lib/permissions/roles";
import type { PlanLimits } from "@/config/plans";
import { TRIAL_PLAN_KEY } from "@/config/plans";
import {
  onboardingFloorsSchema,
  onboardingOrganizationSchema,
  type OnboardingFloorsInput,
  type OnboardingOrganizationInput,
} from "@/lib/validation/auth";
import { createFloor, createBed, getRoom, updateRoom } from "@/services/hostel/structure-service";
import type { RequestMeta } from "./auth-service";

/**
 * Onboarding wizard state. Progress is derived from what exists in the
 * database, so the wizard can be resumed from any device.
 */

export const ONBOARDING_STEPS = [
  { key: "organization", title: "Organization", optional: false },
  { key: "hostel", title: "First hostel", optional: false },
  { key: "floors", title: "Floors", optional: true },
  { key: "rooms", title: "Rooms", optional: true },
  { key: "beds", title: "Beds", optional: true },
  { key: "team", title: "Invite team", optional: true },
  { key: "complete", title: "Finish", optional: false },
] as const;
export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export type PublicPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  trialDays: number;
  limits: PlanLimits;
  features: string[];
};

function parseLimits(value: unknown): PlanLimits {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const read = (k: keyof PlanLimits) => (typeof v[k] === "number" ? (v[k] as number) : null);
  return {
    maxHostels: read("maxHostels"),
    maxBeds: read("maxBeds"),
    maxResidents: read("maxResidents"),
    maxStaff: read("maxStaff"),
    maxStorageMb: read("maxStorageMb"),
  };
}

/** Public, active plans for the pricing table and plan picker. */
export async function listPublicPlans(): Promise<PublicPlan[]> {
  const plans = await prisma.plan.findMany({
    where: { isPublic: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
  });
  return plans.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    priceMonthly: p.priceMonthly.toNumber(),
    priceYearly: p.priceYearly.toNumber(),
    currency: p.currency,
    trialDays: p.trialDays,
    limits: parseLimits(p.limits),
    features: p.features,
  }));
}

/** Where a signed-in user stands with respect to onboarding. */
export async function getOnboardingStatus(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId, status: "ACTIVE", organization: { status: "ACTIVE", deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { isOwner: true, organizationId: true, organization: { select: { onboardingCompletedAt: true } } },
  });
  const completed = memberships.some((m) => m.organization.onboardingCompletedAt);
  const pending = memberships.find((m) => m.isOwner && !m.organization.onboardingCompletedAt);
  return {
    hasMembership: memberships.length > 0,
    completed,
    /** Organization this user owns that still needs setting up. */
    pendingOrganizationId: pending?.organizationId ?? null,
  };
}

/**
 * Tenant context for the organization being onboarded. Only its owner may
 * run the wizard. Built directly (not via the request-cached helper) so it
 * reflects an organization created earlier in the same request.
 */
export async function loadOnboardingContext(userId: string, meta: RequestMeta = {}): Promise<TenantContext | null> {
  const status = await getOnboardingStatus(userId);
  if (!status.pendingOrganizationId) return null;
  const ctx = await loadTenantContext(prisma, {
    userId,
    preferredOrganizationId: status.pendingOrganizationId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  if (!ctx || ctx.organizationId !== status.pendingOrganizationId || !ctx.isOwner) return null;
  return ctx;
}

function assertOwner(ctx: TenantContext) {
  if (!ctx.isOwner) throw new ForbiddenError("Only the organization owner can complete setup.");
}

/** Snapshot of everything the wizard needs to render any step. */
export async function getOnboardingSnapshot(ctx: TenantContext) {
  assertOwner(ctx);
  const [organization, subscription, hostel] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        country: true,
        currency: true,
        timezone: true,
        onboardingCompletedAt: true,
      },
    }),
    prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { status: true, trialEndsAt: true, plan: { select: { key: true, name: true } } },
    }),
    prisma.hostel.findFirst({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        gender: true,
        city: true,
        defaultBedRent: true,
        defaultDeposit: true,
        address: true,
        country: true,
        phone: true,
        email: true,
        description: true,
        amenities: true,
        rules: true,
        status: true,
        admissionFee: true,
        rentDueDay: true,
        lateFeeAmount: true,
        lateFeeGraceDays: true,
        managerStaffId: true,
      },
    }),
  ]);

  const floors = hostel
    ? await prisma.floor.findMany({
        where: { hostelId: hostel.id, organizationId: ctx.organizationId, archivedAt: null },
        orderBy: { floorNumber: "asc" },
        select: {
          id: true,
          name: true,
          floorNumber: true,
          rooms: {
            where: { archivedAt: null },
            orderBy: { roomNumber: "asc" },
            select: {
              id: true,
              roomNumber: true,
              roomType: true,
              capacity: true,
              rent: true,
              _count: { select: { beds: { where: { archivedAt: null } } } },
            },
          },
        },
      })
    : [];

  const invitations = await prisma.invitation.findMany({
    where: { organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: { select: { name: true } }, createdAt: true },
  });

  const roomCount = floors.reduce((n, f) => n + f.rooms.length, 0);
  const bedCount = floors.reduce((n, f) => n + f.rooms.reduce((m, r) => m + r._count.beds, 0), 0);

  /** Furthest step the data supports; used when no ?step= is given. */
  const resumeStep = !hostel ? 2 : floors.length === 0 ? 3 : roomCount === 0 ? 4 : 5;

  return serialize({
    organization,
    planKey: subscription?.plan.key ?? TRIAL_PLAN_KEY,
    planName: subscription?.plan.name ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    hostel,
    floors: floors.map((f) => ({
      id: f.id,
      name: f.name,
      floorNumber: f.floorNumber,
      rooms: f.rooms.map((r) => ({
        id: r.id,
        roomNumber: r.roomNumber,
        roomType: r.roomType,
        capacity: r.capacity,
        rent: r.rent,
        bedCount: r._count.beds,
      })),
    })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, roleName: i.role.name, createdAt: i.createdAt })),
    counts: { floors: floors.length, rooms: roomCount, beds: bedCount, invitations: invitations.length },
    resumeStep,
  });
}
export type OnboardingSnapshot = Awaited<ReturnType<typeof getOnboardingSnapshot>>;

/**
 * Edit the organization profile (and, while still in the trial, the chosen
 * plan) when the owner goes back to step 1.
 */
export async function updateOnboardingOrganization(ctx: TenantContext, raw: OnboardingOrganizationInput) {
  assertOwner(ctx);
  requirePermission(ctx, "settings.organization");
  const { planKey, ...input } = parseInput(onboardingOrganizationSchema, raw);
  const before = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { name: true, email: true, phone: true, city: true, country: true, currency: true, timezone: true },
  });
  const plan = await prisma.plan.findFirst({ where: { key: planKey, isActive: true, isPublic: true } });
  if (!plan) throw new ValidationError("Choose an available plan.", { planKey: ["Choose an available plan"] });
  const subscription = await prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } });

  await prisma.$transaction(async (tx) => {
    const after = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        currency: input.currency,
        timezone: input.timezone,
      },
      select: { name: true, email: true, phone: true, city: true, country: true, currency: true, timezone: true },
    });
    await audit(actorOf(ctx), { action: "organization.updated", entityType: "Organization", entityId: ctx.organizationId, before, after }, tx);

    if (subscription && subscription.planId !== plan.id && subscription.status === "TRIALING") {
      const trialDays = plan.trialDays > 0 ? plan.trialDays : 14;
      const trialEndsAt = new Date(subscription.createdAt.getTime() + trialDays * 86400_000);
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { planId: plan.id, trialEndsAt, currentPeriodEnd: trialEndsAt },
      });
      await audit(
        actorOf(ctx),
        {
          action: "subscription.plan_selected",
          entityType: "Subscription",
          entityId: subscription.id,
          before: { planId: subscription.planId },
          after: { planId: plan.id, plan: plan.key },
        },
        tx,
      );
    }
  });
}

/** Create several floors in one go; floors whose number already exists are skipped. */
export async function createOnboardingFloors(ctx: TenantContext, raw: OnboardingFloorsInput) {
  requirePermission(ctx, "rooms.manage");
  const input = parseInput(onboardingFloorsSchema, raw);
  const existing = await prisma.floor.findMany({
    where: { hostelId: input.hostelId, organizationId: ctx.organizationId, archivedAt: null },
    select: { floorNumber: true },
  });
  const taken = new Set(existing.map((f) => f.floorNumber));
  let created = 0;
  for (const floor of input.floors) {
    if (taken.has(floor.floorNumber)) continue;
    await createFloor(ctx, { hostelId: input.hostelId, name: floor.name, floorNumber: floor.floorNumber });
    created++;
  }
  return { created, skipped: input.floors.length - created };
}

/**
 * Add one bed to a room from the review step, raising the room's capacity
 * first when it is already full.
 */
export async function addBedToRoom(ctx: TenantContext, roomId: string) {
  requirePermission(ctx, "rooms.manage");
  const room = await getRoom(ctx, roomId);
  if (room.beds.length >= 50) throw new BusinessRuleError("A room can have at most 50 beds.");
  if (room.beds.length >= room.capacity) {
    await updateRoom(ctx, room.id, {
      floorId: room.floorId,
      roomNumber: room.roomNumber,
      roomType: room.roomType === "SINGLE" || room.roomType === "DOUBLE" || room.roomType === "TRIPLE" || room.roomType === "FOUR_BED" ? "CUSTOM" : room.roomType,
      capacity: room.beds.length + 1,
      status: room.status,
      rent: room.rent ?? undefined,
      description: room.description ?? undefined,
      amenities: room.amenities,
    });
  }
  const used = new Set(room.beds.map((b) => b.bedNumber));
  let next = room.beds.length + 1;
  while (used.has(String(next))) next++;
  const bed = await createBed(ctx, { roomId: room.id, bedNumber: String(next) });
  return { id: bed.id, bedNumber: bed.bedNumber };
}

/** Roles that can be offered to invited staff (everything except Owner). */
export async function listInvitableRoles(ctx: TenantContext) {
  requirePermission(ctx, "settings.members");
  return prisma.role.findMany({
    where: { organizationId: ctx.organizationId, key: { not: OWNER_ROLE_KEY } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, defaultAllHostels: true },
  });
}

/** Mark onboarding finished. Only the owner can do this, and a hostel must exist. */
export async function completeOnboarding(ctx: TenantContext) {
  assertOwner(ctx);
  const organization = await prisma.organization.findFirst({
    where: { id: ctx.organizationId, members: { some: { userId: ctx.userId, isOwner: true, status: "ACTIVE" } } },
    select: { id: true, onboardingCompletedAt: true },
  });
  if (!organization) throw new NotFoundError("Organization");
  if (organization.onboardingCompletedAt) return { alreadyCompleted: true };
  const hostels = await prisma.hostel.count({ where: { organizationId: ctx.organizationId, archivedAt: null } });
  if (hostels === 0) throw new BusinessRuleError("Add your first hostel before finishing setup.");

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: ctx.organizationId }, data: { onboardingCompletedAt: new Date() } });
    await audit(actorOf(ctx), { action: "organization.onboarding_completed", entityType: "Organization", entityId: ctx.organizationId }, tx);
  });
  return { alreadyCompleted: false };
}
