import "server-only";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import type { ResidentContext } from "@/lib/tenant/resident";
import { serialize } from "@/lib/serialize";
import { parseInput } from "@/lib/validation/parse";
import { portalProfileSchema, type PortalProfileInput } from "@/lib/validation/portal";
import { residentActor } from "./shared";

const profileSelect = {
  id: true,
  residentCode: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  alternatePhone: true,
  gender: true,
  dateOfBirth: true,
  nationality: true,
  photoFileId: true,
  address: true,
  city: true,
  occupation: true,
  institution: true,
  joiningDate: true,
  expectedLeavingDate: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyContactRelation: true,
  guardianName: true,
  guardianPhone: true,
  status: true,
  hostel: { select: { id: true, name: true } },
  user: { select: { email: true } },
} as const;

/** The resident's own record. Internal notes and ID numbers are never exposed. */
export async function getPortalProfile(ctx: ResidentContext) {
  const resident = await prisma.resident.findFirst({
    where: { id: ctx.residentId, organizationId: ctx.organizationId },
    select: profileSelect,
  });
  if (!resident) throw new NotFoundError("Resident");
  return serialize(resident);
}

const EDITABLE = ["phone", "alternatePhone", "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation"] as const;

export async function updatePortalProfile(ctx: ResidentContext, raw: PortalProfileInput) {
  const input = parseInput(portalProfileSchema, raw);
  const actor = await residentActor(ctx);
  return prisma.$transaction(async (tx) => {
    const before = await tx.resident.findFirst({
      where: { id: ctx.residentId, organizationId: ctx.organizationId, archivedAt: null },
      select: { phone: true, alternatePhone: true, emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true },
    });
    if (!before) throw new NotFoundError("Resident");
    const data = {
      phone: input.phone,
      alternatePhone: input.alternatePhone ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
      emergencyContactRelation: input.emergencyContactRelation ?? null,
    };
    const changed = EDITABLE.filter((k) => (before[k] ?? null) !== data[k]);
    if (changed.length === 0) return { changed: 0 };
    await tx.resident.update({ where: { id: ctx.residentId }, data });
    await audit(
      actor,
      {
        action: "resident.profile_updated",
        entityType: "Resident",
        entityId: ctx.residentId,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, data[k]])),
        metadata: { source: "portal" },
      },
      tx,
    );
    return { changed: changed.length };
  });
}
