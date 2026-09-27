import { prisma, type DbClient } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { EmploymentType, StaffStatus, StaffType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  actorOf,
  assertHostelAccess,
  can,
  requireAnyPermission,
  requirePermission,
  type TenantContext,
} from "@/lib/tenant/context";
import {
  archiveStaffSchema,
  EMPLOYED_STATUSES,
  staffDocumentSchema,
  staffSchema,
  type ArchiveStaffInput,
  type StaffDocumentInput,
  type StaffInput,
} from "@/lib/validation/staff";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { assertWithinLimit } from "@/lib/subscription/limits";
import { serialize } from "@/lib/serialize";
import { nextCode } from "@/lib/sequence";
import { dateOnly, fullName, todayInTimeZone } from "@/lib/format";
import { EXPORT_ROW_LIMIT } from "@/lib/export";
import { claimUpload } from "@/services/files/file-service";
import { staffAccessWhere, staffScopeWhere } from "./scope";
import { summarizeAttendance } from "./attendance-math";

const isEmployed = (status: StaffStatus) => (EMPLOYED_STATUSES as readonly string[]).includes(status);

// ─── Listing ────────────────────────────────────────────────────────────────

export type StaffListFilters = {
  q?: string;
  designation?: StaffType;
  status?: StaffStatus | "ARCHIVED";
  employmentType?: EmploymentType;
  hostelId?: string | null;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

function staffListWhere(ctx: TenantContext, filters: StaffListFilters): Prisma.StaffWhereInput {
  return {
    ...staffScopeWhere(ctx, filters.hostelId),
    ...(filters.status === "ARCHIVED"
      ? { archivedAt: { not: null } }
      : { archivedAt: null, ...(filters.status ? { status: filters.status } : {}) }),
    ...(filters.designation ? { designation: filters.designation } : {}),
    ...(filters.employmentType ? { employmentType: filters.employmentType } : {}),
    ...(filters.q
      ? {
          OR: [
            { firstName: { contains: filters.q, mode: "insensitive" } },
            { lastName: { contains: filters.q, mode: "insensitive" } },
            { employeeCode: { contains: filters.q, mode: "insensitive" } },
            { phone: { contains: filters.q } },
            { email: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function staffOrderBy(ctx: TenantContext, sort?: string, dir: "asc" | "desc" = "asc"): Prisma.StaffOrderByWithRelationInput[] {
  switch (sort) {
    case "code":
      return [{ employeeCode: dir }];
    case "designation":
      return [{ designation: dir }, { firstName: "asc" }];
    case "joiningDate":
      return [{ joiningDate: dir }];
    case "status":
      return [{ status: dir }, { firstName: "asc" }];
    case "salary":
      // Sorting by salary would leak the ordering to users who can't see salaries.
      return can(ctx, "payroll.view") ? [{ salary: dir }] : [{ firstName: "asc" }];
    case "name":
      return [{ firstName: dir }, { lastName: dir }];
    default:
      return [{ firstName: "asc" }, { lastName: "asc" }];
  }
}

const listInclude = {
  hostels: {
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { isPrimary: true, hostel: { select: { id: true, name: true, code: true } } },
  },
} satisfies Prisma.StaffInclude;

/** Strip salary for members without payroll.view — it never reaches the client. */
function withSalaryVisibility<T extends { salary: Prisma.Decimal }>(ctx: TenantContext, row: T) {
  const { salary, ...rest } = row;
  return { ...rest, salary: can(ctx, "payroll.view") ? salary : null };
}

export async function listStaff(ctx: TenantContext, filters: StaffListFilters = {}) {
  requirePermission(ctx, "staff.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where = staffListWhere(ctx, filters);
  const [rows, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      skip,
      take,
      orderBy: staffOrderBy(ctx, filters.sort, filters.dir),
      include: listInclude,
    }),
    prisma.staff.count({ where }),
  ]);
  return serialize(toPaginated(rows.map((r) => withSalaryVisibility(ctx, r)), total, page, pageSize));
}

/** Same filters as the list, capped for exports. */
export async function listStaffForExport(ctx: TenantContext, filters: StaffListFilters = {}) {
  requirePermission(ctx, "staff.view");
  const rows = await prisma.staff.findMany({
    where: staffListWhere(ctx, filters),
    orderBy: staffOrderBy(ctx, filters.sort, filters.dir),
    take: EXPORT_ROW_LIMIT,
    include: listInclude,
  });
  return serialize(rows.map((r) => withSalaryVisibility(ctx, r)));
}

/**
 * Lightweight picker for other modules (maintenance / complaint assignment).
 * Only employed, non-archived staff in the caller's scope.
 */
export async function listStaffForAssignment(ctx: TenantContext, hostelId?: string | null) {
  requireAnyPermission(ctx, "staff.view", "maintenance.manage", "complaints.manage");
  if (hostelId) assertHostelAccess(ctx, hostelId);
  const staff = await prisma.staff.findMany({
    where: {
      ...(hostelId ? { organizationId: ctx.organizationId, hostels: { some: { hostelId } } } : staffAccessWhere(ctx)),
      archivedAt: null,
      status: { in: [...EMPLOYED_STATUSES] },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, designation: true },
  });
  return staff.map((s) => ({ id: s.id, name: fullName(s), designation: s.designation }));
}

/** Active organization members that can be linked to a staff record. */
export async function listLinkableMembers(ctx: TenantContext, staffId?: string) {
  requirePermission(ctx, "staff.manage");
  const [members, linked] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE", user: { status: "ACTIVE" } },
      orderBy: { user: { name: "asc" } },
      select: { userId: true, user: { select: { name: true, email: true } }, role: { select: { name: true } } },
    }),
    prisma.staff.findMany({
      where: { organizationId: ctx.organizationId, userId: { not: null }, ...(staffId ? { id: { not: staffId } } : {}) },
      select: { userId: true },
    }),
  ]);
  const taken = new Set(linked.map((s) => s.userId));
  return members
    .filter((m) => !taken.has(m.userId))
    .map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, roleName: m.role.name }));
}

// ─── Detail ─────────────────────────────────────────────────────────────────

export async function getStaff(ctx: TenantContext, id: string) {
  requirePermission(ctx, "staff.view");
  const staff = await prisma.staff.findFirst({
    where: { id, ...staffAccessWhere(ctx) },
    include: {
      ...listInclude,
      user: { select: { id: true, name: true, email: true } },
      managedHostels: { where: { archivedAt: null }, select: { id: true, name: true } },
    },
  });
  if (!staff) throw new NotFoundError("Staff member");

  const today = todayInTimeZone(ctx.organization.timezone);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const [documents, attendance, leaves, payrolls] = await Promise.all([
    // Staff documents are only served to staff.manage (see authorizeFileAccess).
    can(ctx, "staff.manage")
      ? prisma.staffDocument.findMany({
          where: { staffId: id, organizationId: ctx.organizationId, file: { deletedAt: null } },
          orderBy: { createdAt: "desc" },
          include: { file: { select: { id: true, originalName: true, mimeType: true, size: true } } },
        })
      : Promise.resolve(null),
    can(ctx, "attendance.view")
      ? prisma.staffAttendance.findMany({
          where: { staffId: id, organizationId: ctx.organizationId, date: { gte: monthStart, lte: monthEnd } },
          select: { status: true },
        })
      : Promise.resolve(null),
    can(ctx, "leave.view")
      ? prisma.staffLeave.findMany({
          where: { staffId: id, organizationId: ctx.organizationId },
          orderBy: { startDate: "desc" },
          take: 5,
          include: { reviewedBy: { select: { name: true } } },
        })
      : Promise.resolve(null),
    can(ctx, "payroll.view")
      ? prisma.payroll.findMany({
          where: { staffId: id, organizationId: ctx.organizationId },
          orderBy: [{ year: "desc" }, { month: "desc" }],
          take: 12,
        })
      : Promise.resolve(null),
  ]);

  return serialize({
    ...withSalaryVisibility(ctx, staff),
    documents,
    attendanceSummary: attendance ? { year, month, ...summarizeAttendance(attendance.map((a) => a.status)) } : null,
    recentLeaves: leaves,
    payrolls,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

async function assertLinkableUser(db: DbClient, ctx: TenantContext, userId: string, staffId?: string) {
  const member = await db.organizationMember.findFirst({
    where: { organizationId: ctx.organizationId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!member) throw new ValidationError("Select an active team member.", { userId: ["Select an active team member"] });
  const clash = await db.staff.findFirst({
    where: { organizationId: ctx.organizationId, userId, ...(staffId ? { id: { not: staffId } } : {}) },
    select: { employeeCode: true, firstName: true, lastName: true },
  });
  if (clash) {
    throw new ConflictError(
      `This account is already linked to ${fullName(clash)} (${clash.employeeCode}). Unlink it there first.`,
    );
  }
}

/** Every hostel id must be accessible; newly added ones must exist and not be archived. */
async function assertAssignableHostels(ctx: TenantContext, hostelIds: string[], alreadyAssigned: string[] = []) {
  for (const hostelId of hostelIds) assertHostelAccess(ctx, hostelId);
  const added = hostelIds.filter((h) => !alreadyAssigned.includes(h));
  if (added.length === 0) return;
  const found = await prisma.hostel.count({
    where: { id: { in: added }, organizationId: ctx.organizationId, archivedAt: null },
  });
  if (found !== added.length) {
    throw new ValidationError("One of the selected hostels is archived or no longer exists.", {
      hostelIds: ["Select active hostels only"],
    });
  }
}

export async function createStaff(ctx: TenantContext, raw: StaffInput) {
  requirePermission(ctx, "staff.manage");
  const input = parseInput(staffSchema, raw);
  await assertAssignableHostels(ctx, input.hostelIds);
  if (isEmployed(input.status)) await assertWithinLimit(prisma, ctx.organizationId, "staff");
  const primaryHostelId = input.primaryHostelId ?? input.hostelIds[0]!;
  // Only payroll viewers may set salaries.
  const salary = can(ctx, "payroll.view") ? input.salary : 0;

  return prisma.$transaction(async (tx) => {
    if (input.userId) await assertLinkableUser(tx, ctx, input.userId);
    const photo = input.photoFileId
      ? await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, input.photoFileId, ["staff-photo"])
      : null;
    const employeeCode = await nextCode(tx, ctx.organizationId, "staff", "EMP", 4);
    const staff = await tx.staff.create({
      data: {
        organizationId: ctx.organizationId,
        employeeCode,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email ?? null,
        idNumber: input.idNumber ?? null,
        address: input.address ?? null,
        dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null,
        joiningDate: dateOnly(input.joiningDate),
        designation: input.designation,
        department: input.department ?? null,
        employmentType: input.employmentType,
        status: input.status,
        salary,
        notes: input.notes ?? null,
        userId: input.userId ?? null,
        photoFileId: photo?.id ?? null,
        hostels: {
          create: input.hostelIds.map((hostelId) => ({ hostelId, isPrimary: hostelId === primaryHostelId })),
        },
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "staff.created",
        entityType: "Staff",
        entityId: staff.id,
        after: { ...staff, hostelIds: input.hostelIds, primaryHostelId },
      },
      tx,
    );
    return serialize({ id: staff.id, employeeCode: staff.employeeCode });
  });
}

export async function updateStaff(ctx: TenantContext, id: string, raw: StaffInput) {
  requirePermission(ctx, "staff.manage");
  const input = parseInput(staffSchema, raw);
  const before = await prisma.staff.findFirst({
    where: { id, ...staffAccessWhere(ctx) },
    include: { hostels: { select: { hostelId: true, isPrimary: true } } },
  });
  if (!before) throw new NotFoundError("Staff member");
  if (before.archivedAt) throw new BusinessRuleError("Restore this staff member before editing.");

  const existingIds = before.hostels.map((h) => h.hostelId);
  await assertAssignableHostels(ctx, input.hostelIds, existingIds);
  if (!isEmployed(before.status) && isEmployed(input.status)) {
    await assertWithinLimit(prisma, ctx.organizationId, "staff");
  }

  // Assignments to hostels this member can't see are preserved untouched.
  const hidden = existingIds.filter((h) => !ctx.accessibleHostelIds.includes(h));
  const finalIds = [...new Set([...input.hostelIds, ...hidden])];
  const currentPrimary = before.hostels.find((h) => h.isPrimary)?.hostelId;
  const primaryHostelId =
    input.primaryHostelId ?? (currentPrimary && finalIds.includes(currentPrimary) ? currentPrimary : input.hostelIds[0]!);
  const salary = can(ctx, "payroll.view") ? input.salary : before.salary;

  return prisma.$transaction(async (tx) => {
    if (input.userId && input.userId !== before.userId) await assertLinkableUser(tx, ctx, input.userId, id);

    let photoFileId = before.photoFileId;
    if (input.photoFileId && input.photoFileId !== before.photoFileId) {
      const photo = await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, input.photoFileId, ["staff-photo"]);
      photoFileId = photo.id;
    } else if (input.removePhoto) {
      photoFileId = null;
    }

    const staff = await tx.staff.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email ?? null,
        idNumber: input.idNumber ?? null,
        address: input.address ?? null,
        dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null,
        joiningDate: dateOnly(input.joiningDate),
        designation: input.designation,
        department: input.department ?? null,
        employmentType: input.employmentType,
        status: input.status,
        salary,
        notes: input.notes ?? null,
        userId: input.userId ?? null,
        photoFileId,
      },
    });
    if (before.photoFileId && before.photoFileId !== photoFileId) {
      await tx.storedFile.update({ where: { id: before.photoFileId }, data: { deletedAt: new Date() } });
    }

    await tx.staffHostelAssignment.deleteMany({ where: { staffId: id, hostelId: { notIn: finalIds } } });
    for (const hostelId of finalIds) {
      await tx.staffHostelAssignment.upsert({
        where: { staffId_hostelId: { staffId: id, hostelId } },
        create: { staffId: id, hostelId, isPrimary: hostelId === primaryHostelId },
        update: { isPrimary: hostelId === primaryHostelId },
      });
    }

    await audit(
      actorOf(ctx),
      {
        action: "staff.updated",
        entityType: "Staff",
        entityId: id,
        before: { ...before, hostels: before.hostels },
        after: { ...staff, hostelIds: finalIds, primaryHostelId },
      },
      tx,
    );
    if (before.userId !== staff.userId) {
      await audit(
        actorOf(ctx),
        {
          action: "staff.account_linked",
          entityType: "Staff",
          entityId: id,
          before: { userId: before.userId },
          after: { userId: staff.userId },
        },
        tx,
      );
    }
    if (!before.salary.equals(staff.salary)) {
      await audit(
        actorOf(ctx),
        { action: "staff.salary_changed", entityType: "Staff", entityId: id, before: { salary: before.salary }, after: { salary: staff.salary } },
        tx,
      );
    }
    return serialize({ id: staff.id });
  });
}

export async function archiveStaff(ctx: TenantContext, id: string, raw: ArchiveStaffInput = {}) {
  requirePermission(ctx, "staff.manage");
  const input = parseInput(archiveStaffSchema, raw);
  const staff = await prisma.staff.findFirst({ where: { id, ...staffAccessWhere(ctx) } });
  if (!staff) throw new NotFoundError("Staff member");
  if (staff.archivedAt) throw new BusinessRuleError("This staff member is already archived.");

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id }, data: { archivedAt: new Date(), status: input.status } });
    // An archived employee can't keep managing a hostel.
    const managed = await tx.hostel.updateMany({
      where: { organizationId: ctx.organizationId, managerStaffId: id },
      data: { managerStaffId: null },
    });
    await audit(
      actorOf(ctx),
      {
        action: "staff.archived",
        entityType: "Staff",
        entityId: id,
        before: { status: staff.status },
        after: { status: input.status },
        metadata: { hostelsUnassignedAsManager: managed.count },
      },
      tx,
    );
  });
}

export async function restoreStaff(ctx: TenantContext, id: string) {
  requirePermission(ctx, "staff.manage");
  const staff = await prisma.staff.findFirst({ where: { id, ...staffAccessWhere(ctx) } });
  if (!staff) throw new NotFoundError("Staff member");
  if (!staff.archivedAt) throw new BusinessRuleError("This staff member is not archived.");
  await assertWithinLimit(prisma, ctx.organizationId, "staff");
  await prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id }, data: { archivedAt: null, status: "ACTIVE" } });
    await audit(
      actorOf(ctx),
      { action: "staff.restored", entityType: "Staff", entityId: id, before: { status: staff.status }, after: { status: "ACTIVE" } },
      tx,
    );
  });
}

// ─── Documents ──────────────────────────────────────────────────────────────

export async function addStaffDocument(ctx: TenantContext, staffId: string, raw: StaffDocumentInput) {
  requirePermission(ctx, "staff.manage");
  const input = parseInput(staffDocumentSchema, raw);
  const staff = await prisma.staff.findFirst({ where: { id: staffId, ...staffAccessWhere(ctx) }, select: { id: true } });
  if (!staff) throw new NotFoundError("Staff member");
  return prisma.$transaction(async (tx) => {
    const file = await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, input.fileId, ["staff-document"]);
    const doc = await tx.staffDocument.create({
      data: { organizationId: ctx.organizationId, staffId, fileId: file.id, type: input.type, title: input.title },
    });
    await audit(
      actorOf(ctx),
      { action: "staff.document_added", entityType: "Staff", entityId: staffId, after: { documentId: doc.id, type: doc.type, title: doc.title, file: file.originalName } },
      tx,
    );
    return serialize(doc);
  });
}

export async function removeStaffDocument(ctx: TenantContext, documentId: string) {
  requirePermission(ctx, "staff.manage");
  const doc = await prisma.staffDocument.findFirst({
    where: { id: documentId, organizationId: ctx.organizationId, staff: staffAccessWhere(ctx) },
  });
  if (!doc) throw new NotFoundError("Document");
  await prisma.$transaction(async (tx) => {
    await tx.staffDocument.delete({ where: { id: doc.id } });
    await tx.storedFile.update({ where: { id: doc.fileId }, data: { deletedAt: new Date() } });
    await audit(
      actorOf(ctx),
      { action: "staff.document_removed", entityType: "Staff", entityId: doc.staffId, before: { documentId: doc.id, type: doc.type, title: doc.title } },
      tx,
    );
  });
}
