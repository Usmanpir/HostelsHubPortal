import { prisma, type DbClient } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ResidentStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import {
  accessWhere,
  actorOf,
  assertHostelAccess,
  can,
  canAny,
  requireAnyPermission,
  requirePermission,
  scopedWhere,
  type TenantContext,
} from "@/lib/tenant/context";
import {
  bulkResidentStatusSchema,
  residentDocumentSchema,
  residentSchema,
  type BulkResidentStatusInput,
  type ResidentDocumentInput,
  type ResidentInput,
  type ResidentValues,
} from "@/lib/validation/resident";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { assertWithinLimit } from "@/lib/subscription/limits";
import { nextCode } from "@/lib/sequence";
import { serialize, toNumber } from "@/lib/serialize";
import { dateOnly, fullName } from "@/lib/format";
import { EXPORT_ROW_LIMIT } from "@/lib/export";
import { claimUpload } from "@/services/files/file-service";
import { getResidentBalance, getResidentBalances } from "@/services/finance/ledger";
import { LIVE_ASSIGNMENT_STATUSES, placementLabel } from "./shared";

// ─── Queries ────────────────────────────────────────────────────────────────

export type ResidentSort = "name" | "code" | "joined" | "hostel" | "status" | "created";

export type ResidentListFilters = {
  q?: string;
  /** Omit to show everyone except archived residents. */
  status?: ResidentStatus | "ALL";
  hostelId?: string | null;
  /** "yes" = has a live (active/reserved) stay, "no" = no bed. */
  assigned?: "yes" | "no";
  sort?: ResidentSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Every term must match one of the searchable fields ("ali khan" → first + last name). */
function residentSearch(q: string | undefined): Prisma.ResidentWhereInput {
  const terms = (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (terms.length === 0) return {};
  return {
    AND: terms.map((t) => ({
      OR: [
        { firstName: { contains: t, mode: "insensitive" as const } },
        { lastName: { contains: t, mode: "insensitive" as const } },
        { residentCode: { contains: t, mode: "insensitive" as const } },
        { phone: { contains: t } },
        { email: { contains: t, mode: "insensitive" as const } },
        { idNumber: { contains: t, mode: "insensitive" as const } },
      ],
    })),
  };
}

function residentListWhere(ctx: TenantContext, filters: ResidentListFilters): Prisma.ResidentWhereInput {
  return {
    ...scopedWhere(ctx, filters.hostelId),
    ...(filters.status === "ALL"
      ? {}
      : filters.status
        ? { status: filters.status }
        : { status: { not: "ARCHIVED" as const } }),
    ...(filters.assigned === "yes"
      ? { assignments: { some: { status: { in: LIVE_ASSIGNMENT_STATUSES } } } }
      : filters.assigned === "no"
        ? { assignments: { none: { status: { in: LIVE_ASSIGNMENT_STATUSES } } } }
        : {}),
    ...residentSearch(filters.q),
  };
}

function residentOrder(sort: ResidentSort | undefined, dir: "asc" | "desc" = "asc"): Prisma.ResidentOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return [{ firstName: dir }, { lastName: dir }];
    case "code":
      return [{ residentCode: dir }];
    case "joined":
      return [{ joiningDate: dir }, { createdAt: dir }];
    case "hostel":
      return [{ hostel: { name: dir } }, { firstName: "asc" }];
    case "status":
      return [{ status: dir }, { firstName: "asc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

const liveStaySelect = {
  where: { status: { in: LIVE_ASSIGNMENT_STATUSES } },
  take: 1,
  select: {
    id: true,
    status: true,
    checkInDate: true,
    monthlyRent: true,
    securityDeposit: true,
    room: { select: { id: true, roomNumber: true } },
    bed: { select: { id: true, bedNumber: true } },
  },
} satisfies Prisma.Resident$assignmentsArgs;

const listInclude = {
  hostel: { select: { id: true, name: true, code: true } },
  assignments: liveStaySelect,
} satisfies Prisma.ResidentInclude;

type ResidentListRecord = Prisma.ResidentGetPayload<{ include: typeof listInclude }>;

function canSeeBalances(ctx: TenantContext) {
  return canAny(ctx, "invoices.view", "payments.view");
}

async function toListRows(ctx: TenantContext, rows: ResidentListRecord[]) {
  const balances = canSeeBalances(ctx)
    ? await getResidentBalances(ctx.organizationId, rows.map((r) => r.id))
    : null;
  return rows.map(({ assignments, ...r }) => ({
    id: r.id,
    residentCode: r.residentCode,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    email: r.email,
    idNumber: r.idNumber,
    gender: r.gender,
    status: r.status,
    photoFileId: r.photoFileId,
    joiningDate: r.joiningDate,
    expectedLeavingDate: r.expectedLeavingDate,
    actualLeavingDate: r.actualLeavingDate,
    occupation: r.occupation,
    institution: r.institution,
    hostel: r.hostel,
    stay: assignments[0] ?? null,
    balance: balances ? (balances.get(r.id) ?? null) : null,
  }));
}

export async function listResidents(ctx: TenantContext, filters: ResidentListFilters = {}) {
  requirePermission(ctx, "residents.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where = residentListWhere(ctx, filters);
  const [rows, total] = await Promise.all([
    prisma.resident.findMany({ where, skip, take, orderBy: residentOrder(filters.sort, filters.dir), include: listInclude }),
    prisma.resident.count({ where }),
  ]);
  const items = await toListRows(ctx, rows);
  return serialize({ ...toPaginated(items, total, page, pageSize), showBalance: canSeeBalances(ctx) });
}

/** Rows for CSV/XLSX export, honouring the list filters and EXPORT_ROW_LIMIT. */
export async function exportResidents(ctx: TenantContext, filters: ResidentListFilters = {}) {
  requirePermission(ctx, "residents.view");
  const rows = await prisma.resident.findMany({
    where: residentListWhere(ctx, filters),
    orderBy: residentOrder(filters.sort, filters.dir),
    take: EXPORT_ROW_LIMIT,
    include: listInclude,
  });
  return serialize(await toListRows(ctx, rows));
}

/** Resident counts per status for the current hostel scope. */
export async function getResidentStatusCounts(ctx: TenantContext) {
  requirePermission(ctx, "residents.view");
  const [groups, unassigned] = await Promise.all([
    prisma.resident.groupBy({ by: ["status"], where: scopedWhere(ctx), _count: { _all: true } }),
    prisma.resident.count({
      where: {
        ...scopedWhere(ctx),
        status: { in: ["ACTIVE", "NOTICE"] },
        assignments: { none: { status: { in: LIVE_ASSIGNMENT_STATUSES } } },
      },
    }),
  ]);
  const counts = Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Partial<Record<ResidentStatus, number>>;
  return {
    active: counts.ACTIVE ?? 0,
    notice: counts.NOTICE ?? 0,
    checkedOut: counts.CHECKED_OUT ?? 0,
    suspended: counts.SUSPENDED ?? 0,
    archived: counts.ARCHIVED ?? 0,
    awaitingBed: unassigned,
  };
}

const OPEN_COMPLAINT = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS"] as const;
const OPEN_MAINTENANCE = ["OPEN", "ASSIGNED", "IN_PROGRESS"] as const;

/** Full resident profile. Financial and document sections depend on permissions. */
export async function getResident(ctx: TenantContext, id: string) {
  requirePermission(ctx, "residents.view");
  const resident = await prisma.resident.findFirst({
    where: { id, ...accessWhere(ctx) },
    include: {
      hostel: { select: { id: true, name: true, code: true, status: true } },
      user: { select: { id: true, email: true, lastLoginAt: true, status: true } },
      assignments: {
        orderBy: [{ checkInDate: "desc" }, { createdAt: "desc" }],
        include: {
          hostel: { select: { id: true, name: true, rentalMode: true } },
          room: { select: { id: true, roomNumber: true, floor: { select: { name: true } } } },
          bed: { select: { id: true, bedNumber: true } },
          createdBy: { select: { name: true } },
        },
      },
      _count: {
        select: {
          complaints: { where: { status: { in: [...OPEN_COMPLAINT] } } },
          maintenance: { where: { status: { in: [...OPEN_MAINTENANCE] } } },
          requests: { where: { status: "PENDING" } },
          visitors: true,
        },
      },
    },
  });
  if (!resident) throw new NotFoundError("Resident");

  const showInvoices = can(ctx, "invoices.view");
  const showPayments = can(ctx, "payments.view");
  const [documents, requests, balance, invoices, payments, totalComplaints, totalMaintenance] = await Promise.all([
    can(ctx, "residents.documents")
      ? prisma.residentDocument.findMany({
          where: { residentId: id, organizationId: ctx.organizationId },
          orderBy: { createdAt: "desc" },
          include: { file: { select: { id: true, originalName: true, mimeType: true, size: true } } },
        })
      : Promise.resolve(null),
    can(ctx, "requests.view")
      ? prisma.residentRequest.findMany({
          where: { residentId: id, organizationId: ctx.organizationId },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { reviewedBy: { select: { name: true } } },
        })
      : Promise.resolve(null),
    showInvoices || showPayments ? getResidentBalance(ctx.organizationId, id) : Promise.resolve(null),
    showInvoices
      ? prisma.invoice.findMany({
          where: { residentId: id, ...accessWhere(ctx) },
          orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
          take: 6,
          select: { id: true, invoiceNumber: true, issueDate: true, dueDate: true, total: true, amountPaid: true, status: true },
        })
      : Promise.resolve(null),
    showPayments
      ? prisma.payment.findMany({
          where: { residentId: id, ...accessWhere(ctx) },
          orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
          take: 6,
          select: { id: true, receiptNumber: true, paymentDate: true, amount: true, type: true, status: true, method: true },
        })
      : Promise.resolve(null),
    can(ctx, "complaints.view") ? prisma.complaint.count({ where: { residentId: id, organizationId: ctx.organizationId } }) : Promise.resolve(null),
    can(ctx, "maintenance.view") ? prisma.maintenanceRequest.count({ where: { residentId: id, organizationId: ctx.organizationId } }) : Promise.resolve(null),
  ]);

  const currentStay = resident.assignments.find((a) => LIVE_ASSIGNMENT_STATUSES.includes(a.status)) ?? null;
  const currentRoom = currentStay
    ? await prisma.room.findUnique({ where: { id: currentStay.roomId }, select: { capacity: true, roomType: true } })
    : null;

  return serialize({
    ...resident,
    name: fullName(resident),
    currentStay: currentStay ? { ...currentStay, label: placementLabel(currentStay), roomCapacity: currentRoom?.capacity ?? null } : null,
    documents,
    requests,
    finance:
      balance !== null
        ? { balance, invoices, payments, depositHeld: currentStay ? toNumber(currentStay.securityDeposit) : 0 }
        : null,
    counts: {
      openComplaints: resident._count.complaints,
      openMaintenance: resident._count.maintenance,
      pendingRequests: resident._count.requests,
      visitors: resident._count.visitors,
      totalComplaints,
      totalMaintenance,
    },
  });
}

export type ResidentOption = {
  id: string;
  name: string;
  code: string;
  hostelId: string;
  hostelName: string;
  phone: string;
  status: ResidentStatus;
  /** "Room 101 · Bed 2", or null when the resident has no bed. */
  placement: string | null;
  assignmentId: string | null;
};

/**
 * Lightweight resident picker for other modules (invoices, payments, visitors,
 * complaints, maintenance). Accountants can pick residents without residents.view.
 */
export async function listResidentOptions(
  ctx: TenantContext,
  q?: string,
  options: { includeCheckedOut?: boolean; residentId?: string; hostelId?: string | null; limit?: number } = {},
): Promise<ResidentOption[]> {
  requireAnyPermission(
    ctx,
    "residents.view",
    "invoices.manage",
    "payments.manage",
    "visitors.manage",
    "complaints.manage",
    "maintenance.manage",
  );
  const rows = await prisma.resident.findMany({
    where: {
      ...scopedWhere(ctx, options.hostelId),
      archivedAt: null,
      status: options.includeCheckedOut === false ? { in: ["ACTIVE", "NOTICE", "SUSPENDED"] } : { not: "ARCHIVED" },
      ...(options.residentId ? { id: options.residentId } : residentSearch(q)),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: Math.min(Math.max(options.limit ?? 20, 1), 50),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      residentCode: true,
      hostelId: true,
      phone: true,
      status: true,
      hostel: { select: { name: true } },
      assignments: { where: { status: { in: LIVE_ASSIGNMENT_STATUSES } }, take: 1, select: { id: true, room: { select: { roomNumber: true } }, bed: { select: { bedNumber: true } } } },
    },
  });
  return rows.map((r) => {
    const a = r.assignments[0];
    return {
      id: r.id,
      name: fullName(r),
      code: r.residentCode,
      hostelId: r.hostelId,
      hostelName: r.hostel.name,
      phone: r.phone,
      status: r.status,
      placement: a ? placementLabel(a) : null,
      assignmentId: a?.id ?? null,
    };
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

function profileData(input: ResidentValues) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email ?? null,
    phone: input.phone,
    alternatePhone: input.alternatePhone ?? null,
    gender: input.gender ?? null,
    dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null,
    idNumber: input.idNumber ?? null,
    nationality: input.nationality ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    occupation: input.occupation ?? null,
    institution: input.institution ?? null,
    joiningDate: dateOnly(input.joiningDate),
    expectedLeavingDate: input.expectedLeavingDate ? dateOnly(input.expectedLeavingDate) : null,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    emergencyContactRelation: input.emergencyContactRelation ?? null,
    guardianName: input.guardianName ?? null,
    guardianPhone: input.guardianPhone ?? null,
    notes: input.notes ?? null,
  };
}

async function loadWritableHostel(ctx: TenantContext, hostelId: string) {
  assertHostelAccess(ctx, hostelId);
  const hostel = await prisma.hostel.findFirst({
    where: { id: hostelId, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!hostel) throw new NotFoundError("Hostel");
  return hostel;
}

/** CNIC / passport numbers identify a person; warn before creating a duplicate profile. */
async function assertUniqueIdNumber(ctx: TenantContext, idNumber: string | undefined, exceptId?: string) {
  if (!idNumber) return;
  const clash = await prisma.resident.findFirst({
    where: {
      organizationId: ctx.organizationId,
      idNumber: { equals: idNumber, mode: "insensitive" },
      archivedAt: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { residentCode: true, firstName: true, lastName: true },
  });
  if (clash) {
    throw new ConflictError(`ID number ${idNumber} is already registered to ${fullName(clash)} (${clash.residentCode}).`);
  }
}

async function attachPhoto(db: DbClient, ctx: TenantContext, fileId: string) {
  await claimUpload(db, { organizationId: ctx.organizationId, userId: ctx.userId }, fileId, ["resident-photo"]);
  return fileId;
}

export async function createResident(ctx: TenantContext, raw: ResidentInput) {
  requirePermission(ctx, "residents.manage");
  const input = parseInput(residentSchema, raw);
  await loadWritableHostel(ctx, input.hostelId);
  await assertUniqueIdNumber(ctx, input.idNumber);
  await assertWithinLimit(prisma, ctx.organizationId, "residents");

  return prisma.$transaction(async (tx) => {
    const residentCode = await nextCode(tx, ctx.organizationId, "resident", "RES", 4);
    const photoFileId = input.photoFileId ? await attachPhoto(tx, ctx, input.photoFileId) : null;
    const resident = await tx.resident.create({
      data: {
        ...profileData(input),
        organizationId: ctx.organizationId,
        hostelId: input.hostelId,
        residentCode,
        status: input.status,
        photoFileId,
      },
    });
    await audit(actorOf(ctx), { action: "resident.created", entityType: "Resident", entityId: resident.id, after: resident }, tx);
    return serialize(resident);
  });
}

export async function updateResident(ctx: TenantContext, id: string, raw: ResidentInput) {
  requirePermission(ctx, "residents.manage");
  const input = parseInput(residentSchema, raw);
  const before = await prisma.resident.findFirst({ where: { id, ...accessWhere(ctx) } });
  if (!before) throw new NotFoundError("Resident");
  if (before.archivedAt || before.status === "ARCHIVED") throw new BusinessRuleError("Restore this resident before editing their profile.");

  if (input.hostelId !== before.hostelId) {
    await loadWritableHostel(ctx, input.hostelId);
    const live = await prisma.residentAssignment.findFirst({ where: { activeResidentId: id }, select: { id: true } });
    if (live) throw new BusinessRuleError("This resident has a bed. Use a transfer to move them to another hostel.");
  }
  await assertUniqueIdNumber(ctx, input.idNumber, id);

  // Checked-out residents become active again only through a new check-in.
  const status: ResidentStatus = before.status === "CHECKED_OUT" ? "CHECKED_OUT" : input.status;

  return prisma.$transaction(async (tx) => {
    let photoFileId = before.photoFileId;
    if ((input.photoFileId ?? null) !== before.photoFileId) {
      photoFileId = input.photoFileId ? await attachPhoto(tx, ctx, input.photoFileId) : null;
      if (before.photoFileId) {
        await tx.storedFile.update({ where: { id: before.photoFileId }, data: { deletedAt: new Date() } });
      }
    }
    const resident = await tx.resident.update({
      where: { id },
      data: { ...profileData(input), hostelId: input.hostelId, status, photoFileId },
    });
    await audit(actorOf(ctx), { action: "resident.updated", entityType: "Resident", entityId: id, before, after: resident }, tx);
    return serialize(resident);
  });
}

/** Soft delete. Archived residents stay in history and reports. */
export async function archiveResident(ctx: TenantContext, id: string) {
  requirePermission(ctx, "residents.manage");
  const resident = await prisma.resident.findFirst({ where: { id, ...accessWhere(ctx) } });
  if (!resident) throw new NotFoundError("Resident");
  if (resident.status === "ARCHIVED") throw new BusinessRuleError("This resident is already archived.");
  const live = await prisma.residentAssignment.findFirst({
    where: { activeResidentId: id },
    select: { status: true, room: { select: { roomNumber: true } }, bed: { select: { bedNumber: true } } },
  });
  if (live) {
    throw new BusinessRuleError(
      live.status === "RESERVED"
        ? `Cancel the reservation for ${placementLabel(live)} before archiving.`
        : `Check this resident out of ${placementLabel(live)} before archiving.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.resident.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await audit(actorOf(ctx), { action: "resident.archived", entityType: "Resident", entityId: id, before: { status: resident.status } }, tx);
  });
}

export async function restoreResident(ctx: TenantContext, id: string) {
  requirePermission(ctx, "residents.manage");
  const resident = await prisma.resident.findFirst({ where: { id, ...accessWhere(ctx) } });
  if (!resident) throw new NotFoundError("Resident");
  if (resident.status !== "ARCHIVED") throw new BusinessRuleError("This resident is not archived.");
  const pastStays = await prisma.residentAssignment.count({
    where: { residentId: id, status: { in: ["COMPLETED", "TRANSFERRED"] } },
  });
  const status: ResidentStatus = pastStays > 0 ? "CHECKED_OUT" : "ACTIVE";
  if (status === "ACTIVE") await assertWithinLimit(prisma, ctx.organizationId, "residents");
  await prisma.$transaction(async (tx) => {
    await tx.resident.update({ where: { id }, data: { status, archivedAt: null } });
    await audit(actorOf(ctx), { action: "resident.restored", entityType: "Resident", entityId: id, after: { status } }, tx);
  });
  return { status };
}

/** Set ACTIVE / NOTICE / SUSPENDED for several residents (e.g. "mark on notice"). */
export async function bulkSetResidentStatus(ctx: TenantContext, raw: BulkResidentStatusInput) {
  requirePermission(ctx, "residents.manage");
  const input = parseInput(bulkResidentStatusSchema, raw);
  const residents = await prisma.resident.findMany({
    where: {
      id: { in: [...new Set(input.residentIds)] },
      ...accessWhere(ctx),
      archivedAt: null,
      status: { in: ["ACTIVE", "NOTICE", "SUSPENDED"] },
    },
    select: { id: true, status: true },
  });
  const changing = residents.filter((r) => r.status !== input.status);
  if (changing.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.resident.updateMany({ where: { id: { in: changing.map((r) => r.id) } }, data: { status: input.status } });
      for (const r of changing) {
        await audit(
          actorOf(ctx),
          { action: "resident.status_changed", entityType: "Resident", entityId: r.id, before: { status: r.status }, after: { status: input.status } },
          tx,
        );
      }
    });
  }
  return { updated: changing.length, skipped: input.residentIds.length - changing.length };
}

// ─── Documents ──────────────────────────────────────────────────────────────

async function loadResidentForDocuments(ctx: TenantContext, residentId: string) {
  requirePermission(ctx, "residents.documents");
  const resident = await prisma.resident.findFirst({
    where: { id: residentId, ...accessWhere(ctx) },
    select: { id: true, residentCode: true },
  });
  if (!resident) throw new NotFoundError("Resident");
  return resident;
}

export async function listResidentDocuments(ctx: TenantContext, residentId: string) {
  await loadResidentForDocuments(ctx, residentId);
  const docs = await prisma.residentDocument.findMany({
    where: { residentId, organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    include: { file: { select: { id: true, originalName: true, mimeType: true, size: true } } },
  });
  return docs.map((d) => ({ ...d, url: `/api/files/${d.fileId}`, downloadUrl: `/api/files/${d.fileId}?download=1` }));
}

export async function attachResidentDocument(ctx: TenantContext, residentId: string, raw: ResidentDocumentInput) {
  const resident = await loadResidentForDocuments(ctx, residentId);
  const input = parseInput(residentDocumentSchema, raw);
  return prisma.$transaction(async (tx) => {
    await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, input.fileId, ["resident-document", "assignment-document"]);
    const doc = await tx.residentDocument.create({
      data: { organizationId: ctx.organizationId, residentId: resident.id, fileId: input.fileId, type: input.type, title: input.title },
    });
    await audit(actorOf(ctx), { action: "resident.document_added", entityType: "Resident", entityId: resident.id, after: doc }, tx);
    return doc;
  });
}

export async function removeResidentDocument(ctx: TenantContext, documentId: string) {
  requirePermission(ctx, "residents.documents");
  const doc = await prisma.residentDocument.findFirst({
    where: {
      id: documentId,
      organizationId: ctx.organizationId,
      resident: ctx.allHostels ? {} : { hostelId: { in: ctx.accessibleHostelIds } },
    },
  });
  if (!doc) throw new NotFoundError("Document");
  await prisma.$transaction(async (tx) => {
    await tx.residentDocument.delete({ where: { id: doc.id } });
    await tx.storedFile.update({ where: { id: doc.fileId }, data: { deletedAt: new Date() } });
    await audit(actorOf(ctx), { action: "resident.document_removed", entityType: "Resident", entityId: doc.residentId, before: doc }, tx);
  });
  return { residentId: doc.residentId };
}
