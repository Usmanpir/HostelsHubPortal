"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { runAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { BusinessRuleError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import { parseInput } from "@/lib/validation/parse";
import type { TenantContext } from "@/lib/tenant/context";
import type { BulkRoomsInput, HostelInput } from "@/lib/validation/property";
import {
  onboardingOrganizationSchema,
  type OnboardingFloorsInput,
  type OnboardingOrganizationInput,
  type StaffInviteInput,
} from "@/lib/validation/auth";
import { createOrganizationForUser } from "@/services/organization/organization-service";
import { createInvitation } from "@/services/organization/invitation-service";
import { createHostel, updateHostel } from "@/services/hostel/hostel-service";
import { bulkCreateRooms } from "@/services/hostel/structure-service";
import {
  addBedToRoom,
  completeOnboarding,
  createOnboardingFloors,
  getOnboardingStatus,
  loadOnboardingContext,
  updateOnboardingOrganization,
} from "@/services/auth/onboarding-service";
import { getRequestMeta, setActiveOrganizationCookie } from "@/services/auth/request";

async function onboardingContext(): Promise<TenantContext> {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  const ctx = await loadOnboardingContext(user.id, await getRequestMeta());
  if (!ctx) throw new BusinessRuleError("Create your organization first.");
  return ctx;
}

function done() {
  revalidatePath("/onboarding");
}

/** Step 1 — create the organization (or update it when going back). */
export async function saveOrganizationAction(raw: OnboardingOrganizationInput) {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new UnauthenticatedError();
    const meta = await getRequestMeta();
    const existing = await loadOnboardingContext(user.id, meta);
    if (existing) {
      await updateOnboardingOrganization(existing, raw);
      done();
      return { organizationId: existing.organizationId };
    }

    const status = await getOnboardingStatus(user.id);
    if (status.completed || status.hasMembership) {
      throw new BusinessRuleError("You already belong to an organization. Open your dashboard to continue.");
    }
    const { planKey, ...profile } = parseInput(onboardingOrganizationSchema, raw);
    const plan = await prisma.plan.findFirst({ where: { key: planKey, isActive: true, isPublic: true }, select: { key: true } });
    if (!plan) throw new ValidationError("Choose an available plan.", { planKey: ["Choose an available plan"] });

    const organization = await createOrganizationForUser(prisma, user.id, profile, { planKey: plan.key, ipAddress: meta.ipAddress });
    await setActiveOrganizationCookie(organization.id);
    done();
    return { organizationId: organization.id };
  }, "Organization saved");
}

/** Step 2 — create or update the first hostel. */
export async function saveHostelAction(hostelId: string | null, input: HostelInput) {
  return runAction(async () => {
    const ctx = await onboardingContext();
    const hostel = hostelId ? await updateHostel(ctx, hostelId, input) : await createHostel(ctx, input);
    done();
    return { id: hostel.id };
  }, "Hostel saved");
}

/** Step 3 — add floors in bulk. */
export async function createFloorsAction(input: OnboardingFloorsInput) {
  return runAction(async () => {
    const result = await createOnboardingFloors(await onboardingContext(), input);
    done();
    return result;
  });
}

/** Step 4 — generate rooms (and their beds) on one floor. */
export async function bulkRoomsAction(input: BulkRoomsInput) {
  return runAction(async () => {
    const result = await bulkCreateRooms(await onboardingContext(), input);
    done();
    return result;
  });
}

/** Step 5 — add a single bed to a room. */
export async function addBedAction(roomId: string) {
  return runAction(async () => {
    const bed = await addBedToRoom(await onboardingContext(), String(roomId));
    done();
    return bed;
  }, "Bed added");
}

/** Step 6 — invite a teammate; returns the shareable accept link. */
export async function inviteStaffAction(input: StaffInviteInput) {
  return runAction(async () => {
    const ctx = await onboardingContext();
    const result = await createInvitation(ctx, {
      email: input.email,
      roleId: input.roleId,
      allHostels: input.allHostels ?? false,
      hostelIds: input.hostelIds ?? [],
    });
    done();
    return { email: input.email, inviteUrl: result.inviteUrl };
  }, "Invitation sent");
}

/** Step 7 — finish setup. */
export async function completeOnboardingAction() {
  return runAction(async () => {
    const ctx = await onboardingContext();
    await completeOnboarding(ctx);
    await setActiveOrganizationCookie(ctx.organizationId);
    revalidatePath("/", "layout");
    return { next: "/dashboard" };
  }, "You're all set!");
}
