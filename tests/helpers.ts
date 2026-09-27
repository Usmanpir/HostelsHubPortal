import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { ensurePlans } from "@/lib/db/ensure-plans";
import { hashPassword } from "@/lib/auth/password";
import { loadTenantContext, type TenantContext } from "@/lib/tenant/context";
import { createOrganizationForUser } from "@/services/organization/organization-service";
import { createHostel } from "@/services/hostel/hostel-service";
import { createFloor, createRoom } from "@/services/hostel/structure-service";

export { prisma };

let plansReady = false;
async function plans() {
  if (!plansReady) {
    await ensurePlans(prisma);
    plansReady = true;
  }
}

const uid = () => randomUUID().slice(0, 8);

export async function createUser(name = "Test User") {
  return prisma.user.create({
    data: { name, email: `${uid()}@test.local`, passwordHash: await hashPassword("Password123") },
  });
}

/** A fresh tenant with an owner, returning the owner's TenantContext. */
export async function createTenant(name = `Org ${uid()}`) {
  await plans();
  const owner = await createUser(`${name} Owner`);
  const org = await createOrganizationForUser(prisma, owner.id, { name, currency: "PKR", timezone: "Asia/Karachi" });
  const ctx = (await loadTenantContext(prisma, { userId: owner.id, preferredOrganizationId: org.id }))!;
  return { org, owner, ctx };
}

/** Reload a context (e.g. after hostels were created, so accessibleHostelIds is fresh). */
export async function reload(ctx: TenantContext, activeHostelId: string | null = null) {
  return (await loadTenantContext(prisma, {
    userId: ctx.userId,
    preferredOrganizationId: ctx.organizationId,
    preferredHostelId: activeHostelId,
  }))!;
}

/** Add a member with a system role, optionally restricted to specific hostels. */
export async function addMember(ctx: TenantContext, roleKey: string, hostelIds?: string[]) {
  const user = await createUser(`${roleKey} member`);
  const role = await prisma.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId: ctx.organizationId, key: roleKey } },
  });
  await prisma.organizationMember.create({
    data: {
      organizationId: ctx.organizationId,
      userId: user.id,
      roleId: role.id,
      allHostels: !hostelIds,
      hostelAccess: hostelIds ? { create: hostelIds.map((hostelId) => ({ hostelId })) } : undefined,
    },
  });
  return (await loadTenantContext(prisma, { userId: user.id, preferredOrganizationId: ctx.organizationId }))!;
}

/** Hostel with one floor and one room of `beds` beds. */
export async function createHostelWithRoom(ctx: TenantContext, beds = 2, rent = 10000) {
  const hostel = await createHostel(ctx, { name: `Hostel ${uid()}`, code: `H${uid().slice(0, 5)}`, defaultBedRent: rent });
  const fresh = await reload(ctx);
  const floor = await createFloor(fresh, { hostelId: hostel.id, name: "Ground", floorNumber: 0 });
  const room = await createRoom(fresh, { floorId: floor.id, roomNumber: `R${uid().slice(0, 4)}`, capacity: beds, rent });
  const bedRows = await prisma.bed.findMany({ where: { roomId: room.id }, orderBy: { bedNumber: "asc" } });
  return { ctx: fresh, hostel, floor, room, beds: bedRows };
}

export async function createResidentRow(ctx: TenantContext, hostelId: string, firstName = "Ali") {
  return prisma.resident.create({
    data: {
      organizationId: ctx.organizationId,
      hostelId,
      residentCode: `RES-${uid()}`,
      firstName,
      lastName: "Khan",
      phone: "+923001234567",
      joiningDate: new Date("2026-01-01T00:00:00Z"),
    },
  });
}
