import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { HostelStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import { actorOf, assertHostelAccess, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { hostelSchema, type HostelInput } from "@/lib/validation/property";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { assertWithinLimit } from "@/lib/subscription/limits";
import { serialize } from "@/lib/serialize";
import { getOccupancy } from "./occupancy";

/** Hostels visible to this member (ignores the header switcher). */
function accessibleHostelWhere(ctx: TenantContext): Prisma.HostelWhereInput {
  return {
    organizationId: ctx.organizationId,
    ...(ctx.allHostels ? {} : { id: { in: ctx.accessibleHostelIds } }),
  };
}

export type HostelListFilters = {
  q?: string;
  status?: HostelStatus | "ALL";
  page?: number;
  pageSize?: number;
};

export async function listHostels(ctx: TenantContext, filters: HostelListFilters = {}) {
  requirePermission(ctx, "hostels.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where: Prisma.HostelWhereInput = {
    ...accessibleHostelWhere(ctx),
    ...(filters.status === "ALL"
      ? {}
      : filters.status
        ? { status: filters.status }
        : { status: { not: "ARCHIVED" as const } }),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { code: { contains: filters.q, mode: "insensitive" } },
            { city: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total, occupancy] = await Promise.all([
    prisma.hostel.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip,
      take,
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { floors: { where: { archivedAt: null } }, rooms: { where: { archivedAt: null } } } },
      },
    }),
    prisma.hostel.count({ where }),
    getOccupancy({ ...ctx, activeHostelId: null }),
  ]);
  const items = rows.map((h) => ({
    ...h,
    occupancy: occupancy.byHostel.get(h.id) ?? null,
  }));
  return serialize(toPaginated(items, total, page, pageSize));
}

/** Lightweight list for selects and the header switcher. */
export async function listHostelOptions(ctx: TenantContext, options: { includeArchived?: boolean } = {}) {
  const rows = await prisma.hostel.findMany({
    where: {
      ...accessibleHostelWhere(ctx),
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, city: true, status: true },
  });
  return rows;
}

export async function getHostel(ctx: TenantContext, id: string) {
  requirePermission(ctx, "hostels.view");
  const hostel = await prisma.hostel.findFirst({
    // AND (not spread): the access filter also constrains `id`.
    where: { AND: [{ id }, accessibleHostelWhere(ctx)] },
    include: {
      manager: { select: { id: true, firstName: true, lastName: true, phone: true } },
      floors: {
        where: { archivedAt: null },
        orderBy: { floorNumber: "asc" },
        include: { _count: { select: { rooms: { where: { archivedAt: null } } } } },
      },
      staffAssignments: {
        include: {
          staff: { select: { id: true, firstName: true, lastName: true, designation: true, phone: true, status: true } },
        },
      },
    },
  });
  if (!hostel) throw new NotFoundError("Hostel");
  const occupancy = await getOccupancy({ ...ctx, activeHostelId: null }, hostel.id);
  const activeResidents = await prisma.residentAssignment.count({
    where: { organizationId: ctx.organizationId, hostelId: hostel.id, status: "ACTIVE" },
  });
  return serialize({ ...hostel, occupancy: occupancy.overall, activeResidents });
}

async function assertOwnerInOrg(ctx: TenantContext, ownerId?: string) {
  if (!ownerId) return;
  const owner = await prisma.propertyOwner.findFirst({
    where: { id: ownerId, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true },
  });
  if (!owner) throw new NotFoundError("Owner");
}

async function assertManagerInOrg(ctx: TenantContext, managerStaffId?: string) {
  if (!managerStaffId) return;
  const staff = await prisma.staff.findFirst({
    where: { id: managerStaffId, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true },
  });
  if (!staff) throw new NotFoundError("Manager");
}

export async function createHostel(ctx: TenantContext, raw: HostelInput) {
  requirePermission(ctx, "hostels.manage");
  const input = parseInput(hostelSchema, raw);
  await assertManagerInOrg(ctx, input.managerStaffId);
  await assertOwnerInOrg(ctx, input.ownerId);
  await assertWithinLimit(prisma, ctx.organizationId, "hostels");

  const existing = await prisma.hostel.findUnique({
    where: { organizationId_code: { organizationId: ctx.organizationId, code: input.code } },
    select: { id: true },
  });
  if (existing) throw new ConflictError(`Hostel code "${input.code}" is already in use.`);

  return prisma.$transaction(async (tx) => {
    const hostel = await tx.hostel.create({
      data: {
        ...input,
        organizationId: ctx.organizationId,
        managerStaffId: input.managerStaffId ?? null,
        ownerId: input.ownerId ?? null,
        managementFeePercent: input.managementFeePercent ?? null,
      },
    });
    // Members restricted to specific hostels automatically get the one they create.
    if (!ctx.allHostels) {
      await tx.memberHostelAccess.create({ data: { memberId: ctx.memberId, hostelId: hostel.id } });
    }
    await audit(actorOf(ctx), { action: "hostel.created", entityType: "Hostel", entityId: hostel.id, after: input }, tx);
    return serialize(hostel);
  });
}

export async function updateHostel(ctx: TenantContext, id: string, raw: HostelInput) {
  requirePermission(ctx, "hostels.manage");
  assertHostelAccess(ctx, id);
  const input = parseInput(hostelSchema, raw);
  await assertManagerInOrg(ctx, input.managerStaffId);
  await assertOwnerInOrg(ctx, input.ownerId);
  const before = await prisma.hostel.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw new NotFoundError("Hostel");
  if (before.status === "ARCHIVED") throw new BusinessRuleError("Restore the hostel before editing it.");

  if (input.code !== before.code) {
    const clash = await prisma.hostel.findUnique({
      where: { organizationId_code: { organizationId: ctx.organizationId, code: input.code } },
      select: { id: true },
    });
    if (clash) throw new ConflictError(`Hostel code "${input.code}" is already in use.`);
  }

  return prisma.$transaction(async (tx) => {
    const hostel = await tx.hostel.update({
      where: { id },
      data: {
        ...input,
        managerStaffId: input.managerStaffId ?? null,
        ownerId: input.ownerId ?? null,
        managementFeePercent: input.managementFeePercent ?? null,
      },
    });
    await audit(actorOf(ctx), { action: "hostel.updated", entityType: "Hostel", entityId: id, before, after: hostel }, tx);
    return serialize(hostel);
  });
}

export async function archiveHostel(ctx: TenantContext, id: string) {
  requirePermission(ctx, "hostels.manage");
  assertHostelAccess(ctx, id);
  const hostel = await prisma.hostel.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!hostel) throw new NotFoundError("Hostel");
  const live = await prisma.residentAssignment.count({
    where: { hostelId: id, status: { in: ["ACTIVE", "RESERVED"] } },
  });
  if (live > 0) {
    throw new BusinessRuleError(`This hostel still has ${live} active or reserved resident(s). Check them out first.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.hostel.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await audit(actorOf(ctx), { action: "hostel.archived", entityType: "Hostel", entityId: id }, tx);
  });
}

export async function restoreHostel(ctx: TenantContext, id: string) {
  requirePermission(ctx, "hostels.manage");
  assertHostelAccess(ctx, id);
  const hostel = await prisma.hostel.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!hostel) throw new NotFoundError("Hostel");
  await assertWithinLimit(prisma, ctx.organizationId, "hostels");
  await prisma.$transaction(async (tx) => {
    await tx.hostel.update({ where: { id }, data: { status: "ACTIVE", archivedAt: null } });
    await audit(actorOf(ctx), { action: "hostel.restored", entityType: "Hostel", entityId: id }, tx);
  });
}
