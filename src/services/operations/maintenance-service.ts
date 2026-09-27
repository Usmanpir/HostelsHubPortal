import { prisma, type DbClient } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { MaintenanceStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  accessWhere,
  actorOf,
  assertHostelAccess,
  can,
  requireAnyPermission,
  requirePermission,
  scopedWhere,
  type TenantContext,
} from "@/lib/tenant/context";
import {
  maintenanceAssignSchema,
  maintenanceEditSchema,
  maintenanceFiltersSchema,
  maintenancePhotosSchema,
  maintenanceSchema,
  maintenanceStatusSchema,
  MAINTENANCE_MANAGER_TRANSITIONS,
  MAINTENANCE_STATUSES,
  MAINTENANCE_WORKER_TRANSITIONS,
  type MaintenanceAssignInput,
  type MaintenanceEditInput,
  type MaintenanceFilters,
  type MaintenanceInput,
  type MaintenancePhotosInput,
  type MaintenanceStatusInput,
} from "@/lib/validation/operations";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { nextCode } from "@/lib/sequence";
import { serialize } from "@/lib/serialize";
import { fullName } from "@/lib/format";
import { notifyMembers, notifyResident, notifyUsers } from "@/lib/notifications/notify";
import { maintenanceStatusLabels } from "@/config/labels";
import { claimUpload } from "@/services/files/file-service";
import { refreshRoomStatus } from "@/services/hostel/occupancy";
import {
  assertAssignableStaff,
  assertResidentInHostel,
  assertWritableHostel,
  getEntityTimeline,
} from "./shared";

/** Mirrors EXPORT_ROW_LIMIT in src/lib/export.ts (not imported to keep exceljs out of action bundles). */
const EXPORT_LIMIT = 10_000;
const ENTITY = "MaintenanceRequest";
const OPEN_STATUSES: MaintenanceStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS"];
const CLOSED_STATUSES: MaintenanceStatus[] = ["COMPLETED", "REJECTED"];

const MANAGER_TRANSITIONS = MAINTENANCE_MANAGER_TRANSITIONS;
const WORKER_TRANSITIONS = MAINTENANCE_WORKER_TRANSITIONS;

const listInclude = {
  hostel: { select: { id: true, name: true, code: true } },
  room: { select: { id: true, roomNumber: true } },
  bed: { select: { id: true, bedNumber: true } },
  resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
  assignedStaff: { select: { id: true, firstName: true, lastName: true, designation: true } },
  _count: { select: { photos: { where: { deletedAt: null } } } },
} satisfies Prisma.MaintenanceRequestInclude;

// ─── Access ─────────────────────────────────────────────────────────────────

/**
 * Members with maintenance.view see every request in their hostels; members
 * with only maintenance.work see requests assigned to their staff profile.
 */
function listScope(ctx: TenantContext, hostelId?: string | null): Prisma.MaintenanceRequestWhereInput {
  requireAnyPermission(ctx, "maintenance.view", "maintenance.work");
  if (can(ctx, "maintenance.view")) return scopedWhere(ctx, hostelId);
  return {
    organizationId: ctx.organizationId,
    assignedStaffId: ctx.staffId ?? "__no_staff_profile__",
    ...(hostelId ? { hostelId } : {}),
  };
}

function recordScope(ctx: TenantContext): Prisma.MaintenanceRequestWhereInput {
  requireAnyPermission(ctx, "maintenance.view", "maintenance.work");
  const scopes: Prisma.MaintenanceRequestWhereInput[] = [];
  if (can(ctx, "maintenance.view")) scopes.push(accessWhere(ctx));
  if (can(ctx, "maintenance.work") && ctx.staffId) {
    scopes.push({ organizationId: ctx.organizationId, assignedStaffId: ctx.staffId });
  }
  if (scopes.length === 0) return { organizationId: ctx.organizationId, id: "__none__" };
  return { OR: scopes };
}

function isAssignedWorker(ctx: TenantContext, request: { assignedStaffId: string | null }) {
  return can(ctx, "maintenance.work") && !!ctx.staffId && request.assignedStaffId === ctx.staffId;
}

function buildWhere(ctx: TenantContext, filters: ReturnType<typeof maintenanceFiltersSchema.parse>) {
  const where: Prisma.MaintenanceRequestWhereInput = {
    AND: [
      listScope(ctx, filters.hostelId),
      filters.status ? { status: filters.status } : {},
      filters.state === "open" ? { status: { in: OPEN_STATUSES } } : filters.state === "closed" ? { status: { in: CLOSED_STATUSES } } : {},
      filters.priority ? { priority: filters.priority } : {},
      filters.category ? { category: filters.category } : {},
      filters.assignedStaffId ? { assignedStaffId: filters.assignedStaffId } : {},
      filters.q
        ? {
            OR: [
              { requestNumber: { contains: filters.q, mode: "insensitive" } },
              { title: { contains: filters.q, mode: "insensitive" } },
              { room: { roomNumber: { contains: filters.q, mode: "insensitive" } } },
              { resident: { firstName: { contains: filters.q, mode: "insensitive" } } },
              { resident: { lastName: { contains: filters.q, mode: "insensitive" } } },
              { resident: { residentCode: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  return where;
}

function orderBy(filters: { sort?: string; dir?: "asc" | "desc" }): Prisma.MaintenanceRequestOrderByWithRelationInput[] {
  const dir = filters.dir ?? "desc";
  switch (filters.sort) {
    case "priority":
      return [{ priority: dir }, { createdAt: "desc" }];
    case "status":
      return [{ status: dir }, { createdAt: "desc" }];
    case "requestNumber":
      return [{ requestNumber: dir }];
    case "createdAt":
      return [{ createdAt: dir }];
    default:
      return [{ createdAt: "desc" }];
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listMaintenance(ctx: TenantContext, raw: MaintenanceFilters = {}) {
  const filters = parseInput(maintenanceFiltersSchema, raw);
  const where = buildWhere(ctx, filters);
  const { skip, take, page, pageSize } = paginate(filters);
  const [rows, total] = await Promise.all([
    prisma.maintenanceRequest.findMany({ where, skip, take, orderBy: orderBy(filters), include: listInclude }),
    prisma.maintenanceRequest.count({ where }),
  ]);
  return serialize(toPaginated(rows, total, page, pageSize));
}

/** Kanban-style view: up to `perColumn` requests per status. */
export async function listMaintenanceBoard(ctx: TenantContext, raw: MaintenanceFilters = {}, perColumn = 50) {
  const filters = parseInput(maintenanceFiltersSchema, { ...raw, status: undefined, state: undefined });
  const base = buildWhere(ctx, filters);
  const columns = await Promise.all(
    MAINTENANCE_STATUSES.map(async (status) => {
      const where: Prisma.MaintenanceRequestWhereInput = { AND: [base, { status }] };
      const [items, total] = await Promise.all([
        prisma.maintenanceRequest.findMany({
          where,
          take: perColumn,
          orderBy: CLOSED_STATUSES.includes(status) ? [{ updatedAt: "desc" }] : [{ priority: "desc" }, { createdAt: "asc" }],
          include: listInclude,
        }),
        prisma.maintenanceRequest.count({ where }),
      ]);
      return { status, items, total };
    }),
  );
  return serialize(columns);
}

export async function exportMaintenance(ctx: TenantContext, raw: MaintenanceFilters = {}) {
  const filters = parseInput(maintenanceFiltersSchema, { ...raw, page: 1, pageSize: 100 });
  const rows = await prisma.maintenanceRequest.findMany({
    where: buildWhere(ctx, filters),
    orderBy: orderBy(filters),
    take: EXPORT_LIMIT,
    include: listInclude,
  });
  return rows;
}

export async function getMaintenance(ctx: TenantContext, id: string) {
  const request = await prisma.maintenanceRequest.findFirst({
    where: { AND: [{ id }, recordScope(ctx)] },
    include: {
      ...listInclude,
      bed: { select: { id: true, bedNumber: true, status: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true, designation: true, phone: true, userId: true } },
      resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true } },
      reportedBy: { select: { id: true, name: true } },
      photos: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
      },
    },
  });
  if (!request) throw new NotFoundError("Maintenance request");
  const timeline = await getEntityTimeline(ctx, ENTITY, request.id);
  const worker = isAssignedWorker(ctx, request);
  const manager = can(ctx, "maintenance.manage") && ctx.accessibleHostelIds.includes(request.hostelId);
  return serialize({
    ...request,
    timeline,
    access: {
      canManage: manager,
      canWork: worker,
      allowedStatuses: allowedTransitions(request.status, { manager, worker }),
      canManageBed: can(ctx, "rooms.manage") && ctx.accessibleHostelIds.includes(request.hostelId),
    },
  });
}

function allowedTransitions(status: MaintenanceStatus, who: { manager: boolean; worker: boolean }) {
  const set = new Set<MaintenanceStatus>();
  if (who.manager) MANAGER_TRANSITIONS[status].forEach((s) => set.add(s));
  if (who.worker) WORKER_TRANSITIONS[status].forEach((s) => set.add(s));
  return MAINTENANCE_STATUSES.filter((s) => set.has(s));
}

/** Rooms and beds of a hostel, for the location pickers on the request form. */
export async function listMaintenanceLocations(ctx: TenantContext, hostelId: string) {
  requireAnyPermission(ctx, "maintenance.manage", "complaints.manage");
  assertHostelAccess(ctx, hostelId);
  const rooms = await prisma.room.findMany({
    where: { organizationId: ctx.organizationId, hostelId, archivedAt: null },
    orderBy: [{ floor: { floorNumber: "asc" } }, { roomNumber: "asc" }],
    select: {
      id: true,
      roomNumber: true,
      floor: { select: { name: true } },
      beds: {
        where: { archivedAt: null },
        orderBy: { bedNumber: "asc" },
        select: { id: true, bedNumber: true, status: true },
      },
    },
  });
  return rooms.map((r) => ({ id: r.id, roomNumber: r.roomNumber, floorName: r.floor.name, beds: r.beds }));
}

/** Open requests (OPEN / ASSIGNED / IN_PROGRESS) visible to this member — for dashboards. */
export async function countOpenMaintenance(ctx: TenantContext) {
  const where: Prisma.MaintenanceRequestWhereInput = { AND: [listScope(ctx), { status: { in: OPEN_STATUSES } }] };
  const [total, urgent, unassigned] = await Promise.all([
    prisma.maintenanceRequest.count({ where }),
    prisma.maintenanceRequest.count({ where: { AND: [where, { priority: { in: ["HIGH", "URGENT"] } }] } }),
    prisma.maintenanceRequest.count({ where: { AND: [where, { assignedStaffId: null }] } }),
  ]);
  return { total, urgent, unassigned };
}

/** Status counts for the list page stat cards. */
export async function getMaintenanceSummary(ctx: TenantContext, hostelId?: string | null) {
  const scope = listScope(ctx, hostelId);
  const grouped = await prisma.maintenanceRequest.groupBy({ by: ["status"], where: scope, _count: { _all: true } });
  const byStatus = Object.fromEntries(MAINTENANCE_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0])) as Record<
    MaintenanceStatus,
    number
  >;
  const urgent = await prisma.maintenanceRequest.count({
    where: { AND: [scope, { status: { in: OPEN_STATUSES }, priority: "URGENT" }] },
  });
  return { byStatus, open: byStatus.OPEN + byStatus.ASSIGNED + byStatus.IN_PROGRESS, urgent };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

async function resolveLocation(
  db: DbClient,
  ctx: TenantContext,
  hostelId: string,
  roomId: string | undefined,
  bedId: string | undefined,
) {
  if (bedId) {
    const bed = await db.bed.findFirst({
      where: { id: bedId, organizationId: ctx.organizationId, hostelId, archivedAt: null },
      select: { id: true, roomId: true, status: true, bedNumber: true },
    });
    if (!bed) throw new ValidationError("Please check the highlighted fields.", { bedId: ["This bed is not in the selected hostel."] });
    if (roomId && bed.roomId !== roomId) {
      throw new ValidationError("Please check the highlighted fields.", { bedId: ["This bed is not in the selected room."] });
    }
    return { roomId: bed.roomId, bed };
  }
  if (roomId) {
    const room = await db.room.findFirst({
      where: { id: roomId, organizationId: ctx.organizationId, hostelId, archivedAt: null },
      select: { id: true },
    });
    if (!room) throw new ValidationError("Please check the highlighted fields.", { roomId: ["This room is not in the selected hostel."] });
    return { roomId: room.id, bed: null };
  }
  return { roomId: null, bed: null };
}

async function attachPhotos(db: DbClient, ctx: TenantContext, requestId: string, fileIds: string[]) {
  if (fileIds.length === 0) return;
  const existing = await db.storedFile.count({ where: { maintenanceRequestId: requestId, deletedAt: null } });
  if (existing + fileIds.length > 20) throw new BusinessRuleError("A request can have at most 20 photos.");
  for (const fileId of fileIds) {
    await claimUpload(db, { organizationId: ctx.organizationId, userId: ctx.userId }, fileId, ["maintenance-photo"]);
  }
  await db.storedFile.updateMany({
    where: { id: { in: fileIds }, organizationId: ctx.organizationId },
    data: { maintenanceRequestId: requestId },
  });
}

/** Take a bed out of service (only when no resident holds it). */
async function markBedUnderMaintenance(db: DbClient, ctx: TenantContext, bed: { id: string; roomId: string; status: string }) {
  if (!can(ctx, "rooms.manage")) throw new ForbiddenError("You don't have permission to change bed status.");
  const live = await db.residentAssignment.findFirst({ where: { activeBedId: bed.id }, select: { id: true } });
  if (live || bed.status === "OCCUPIED" || bed.status === "RESERVED") {
    throw new BusinessRuleError("This bed has a resident, so it can't be marked as under maintenance. Untick the option or move the resident first.");
  }
  if (bed.status === "MAINTENANCE") return false;
  await db.bed.update({ where: { id: bed.id }, data: { status: "MAINTENANCE" } });
  await refreshRoomStatus(db, bed.roomId);
  await audit(actorOf(ctx), { action: "bed.updated", entityType: "Bed", entityId: bed.id, before: { status: bed.status }, after: { status: "MAINTENANCE" }, metadata: { reason: "maintenance-request" } }, db);
  return true;
}

function link(id: string) {
  return `/operations/maintenance/${id}`;
}

export async function createMaintenance(ctx: TenantContext, raw: MaintenanceInput) {
  requirePermission(ctx, "maintenance.manage");
  const input = parseInput(maintenanceSchema, raw);
  await assertWritableHostel(ctx, input.hostelId);
  const resident = input.residentId ? await assertResidentInHostel(ctx, input.hostelId, input.residentId) : null;
  const staff = input.assignedStaffId ? await assertAssignableStaff(ctx, input.hostelId, input.assignedStaffId) : null;
  if (input.markBedMaintenance && !input.bedId) {
    throw new ValidationError("Please check the highlighted fields.", { bedId: ["Select the bed to take out of service."] });
  }

  const request = await prisma.$transaction(async (tx) => {
    const location = await resolveLocation(tx, ctx, input.hostelId, input.roomId, input.bedId);
    const requestNumber = await nextCode(tx, ctx.organizationId, "maintenance", "MNT", 5);
    const created = await tx.maintenanceRequest.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: input.hostelId,
        requestNumber,
        roomId: location.roomId,
        bedId: location.bed?.id ?? null,
        residentId: resident?.id ?? null,
        category: input.category,
        priority: input.priority,
        title: input.title,
        description: input.description ?? null,
        assignedStaffId: staff?.id ?? null,
        status: staff ? "ASSIGNED" : "OPEN",
        reportedById: ctx.userId,
      },
    });
    await attachPhotos(tx, ctx, created.id, input.photoFileIds);
    const bedMarked = input.markBedMaintenance && location.bed ? await markBedUnderMaintenance(tx, ctx, location.bed) : false;
    await audit(
      actorOf(ctx),
      {
        action: "maintenance.created",
        entityType: ENTITY,
        entityId: created.id,
        after: {
          requestNumber,
          title: created.title,
          category: created.category,
          priority: created.priority,
          status: created.status,
          assignedStaff: staff ? fullName(staff) : null,
          photos: input.photoFileIds.length,
          bedMarkedMaintenance: bedMarked,
        },
      },
      tx,
    );
    return created;
  });

  const payload = {
    type: "MAINTENANCE_UPDATED" as const,
    title: `New maintenance request ${request.requestNumber}`,
    body: request.title,
    link: link(request.id),
  };
  await notifyMembers(ctx.organizationId, "maintenance.manage", request.hostelId, payload, { excludeUserId: ctx.userId });
  if (staff?.userId && staff.userId !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [staff.userId], { ...payload, title: `Maintenance assigned to you: ${request.requestNumber}` });
  }
  if (resident) {
    await notifyResident(ctx.organizationId, resident.id, {
      type: "MAINTENANCE_UPDATED",
      title: `Maintenance request ${request.requestNumber} logged`,
      body: request.title,
      link: "/portal",
    });
  }
  return serialize(request);
}

async function loadForWrite(ctx: TenantContext, id: string) {
  const request = await prisma.maintenanceRequest.findFirst({
    where: { AND: [{ id }, recordScope(ctx)] },
    include: {
      assignedStaff: { select: { id: true, userId: true, firstName: true, lastName: true } },
      bed: { select: { id: true, roomId: true, status: true } },
    },
  });
  if (!request) throw new NotFoundError("Maintenance request");
  return request;
}

function assertManager(ctx: TenantContext, request: { hostelId: string }) {
  requirePermission(ctx, "maintenance.manage");
  assertHostelAccess(ctx, request.hostelId);
}

export async function updateMaintenance(ctx: TenantContext, id: string, raw: MaintenanceEditInput) {
  const input = parseInput(maintenanceEditSchema, raw);
  const before = await loadForWrite(ctx, id);
  assertManager(ctx, before);
  const resident = input.residentId ? await assertResidentInHostel(ctx, before.hostelId, input.residentId) : null;

  const updated = await prisma.$transaction(async (tx) => {
    const location = await resolveLocation(tx, ctx, before.hostelId, input.roomId, input.bedId);
    const row = await tx.maintenanceRequest.update({
      where: { id },
      data: {
        roomId: location.roomId,
        bedId: location.bed?.id ?? null,
        residentId: resident?.id ?? null,
        category: input.category,
        priority: input.priority,
        title: input.title,
        description: input.description ?? null,
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "maintenance.updated",
        entityType: ENTITY,
        entityId: id,
        before: { title: before.title, category: before.category, priority: before.priority, roomId: before.roomId, bedId: before.bedId, residentId: before.residentId },
        after: { title: row.title, category: row.category, priority: row.priority, roomId: row.roomId, bedId: row.bedId, residentId: row.residentId },
      },
      tx,
    );
    return row;
  });
  return serialize(updated);
}

export async function assignMaintenance(ctx: TenantContext, id: string, raw: MaintenanceAssignInput) {
  const input = parseInput(maintenanceAssignSchema, raw);
  const before = await loadForWrite(ctx, id);
  assertManager(ctx, before);
  if (CLOSED_STATUSES.includes(before.status)) throw new BusinessRuleError("Reopen this request before changing the assignee.");
  const staff = input.assignedStaffId ? await assertAssignableStaff(ctx, before.hostelId, input.assignedStaffId) : null;
  if ((staff?.id ?? null) === before.assignedStaffId) return serialize(before);

  // Assigning moves OPEN → ASSIGNED; unassigning an ASSIGNED request moves it back to OPEN.
  const status: MaintenanceStatus =
    staff && before.status === "OPEN" ? "ASSIGNED" : !staff && before.status === "ASSIGNED" ? "OPEN" : before.status;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.maintenanceRequest.update({ where: { id }, data: { assignedStaffId: staff?.id ?? null, status } });
    await audit(
      actorOf(ctx),
      {
        action: staff ? "maintenance.assigned" : "maintenance.unassigned",
        entityType: ENTITY,
        entityId: id,
        before: { assignedStaff: before.assignedStaff ? fullName(before.assignedStaff) : null, status: before.status },
        after: { assignedStaff: staff ? fullName(staff) : null, status },
      },
      tx,
    );
    return row;
  });

  if (staff?.userId && staff.userId !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [staff.userId], {
      type: "MAINTENANCE_UPDATED",
      title: `Maintenance assigned to you: ${before.requestNumber}`,
      body: before.title,
      link: link(id),
    });
  }
  if (before.residentId && status !== before.status) {
    await notifyResident(ctx.organizationId, before.residentId, {
      type: "MAINTENANCE_UPDATED",
      title: `Maintenance ${before.requestNumber}: ${maintenanceStatusLabels[status]}`,
      body: staff ? `${fullName(staff)} will look into "${before.title}".` : before.title,
      link: "/portal",
    });
  }
  return serialize(updated);
}

/**
 * Change status and/or resolution notes. Managers can make any allowed move;
 * the assigned worker can go ASSIGNED → IN_PROGRESS → COMPLETED and edit notes.
 * Passing the current status only updates the notes.
 */
export async function updateMaintenanceStatus(ctx: TenantContext, id: string, raw: MaintenanceStatusInput) {
  const input = parseInput(maintenanceStatusSchema, raw);
  const before = await loadForWrite(ctx, id);
  const manager = can(ctx, "maintenance.manage") && ctx.accessibleHostelIds.includes(before.hostelId);
  const worker = isAssignedWorker(ctx, before);
  if (!manager && !worker) throw new ForbiddenError();

  const statusChanged = input.status !== before.status;
  if (statusChanged) {
    if (!allowedTransitions(before.status, { manager, worker }).includes(input.status)) {
      throw new BusinessRuleError(
        `A request that is ${maintenanceStatusLabels[before.status].toLowerCase()} can't be moved to ${maintenanceStatusLabels[input.status].toLowerCase()}.`,
      );
    }
    if (input.status === "ASSIGNED" && !before.assignedStaffId) {
      throw new BusinessRuleError("Assign a staff member first.");
    }
  }
  const notes = input.notes ?? null;
  if (!statusChanged && notes === before.resolutionNotes) return serialize(before);

  const releaseBed =
    input.releaseBed &&
    statusChanged &&
    CLOSED_STATUSES.includes(input.status) &&
    before.bed?.status === "MAINTENANCE" &&
    can(ctx, "rooms.manage") &&
    ctx.accessibleHostelIds.includes(before.hostelId);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.maintenanceRequest.update({
      where: { id },
      data: {
        status: input.status,
        resolutionNotes: notes,
        completedAt: input.status === "COMPLETED" ? (before.status === "COMPLETED" ? before.completedAt : new Date()) : null,
      },
    });
    if (releaseBed && before.bed) {
      const live = await tx.residentAssignment.findFirst({ where: { activeBedId: before.bed.id }, select: { id: true } });
      if (!live) {
        await tx.bed.update({ where: { id: before.bed.id }, data: { status: "AVAILABLE" } });
        await refreshRoomStatus(tx, before.bed.roomId);
        await audit(actorOf(ctx), { action: "bed.updated", entityType: "Bed", entityId: before.bed.id, before: { status: "MAINTENANCE" }, after: { status: "AVAILABLE" }, metadata: { reason: "maintenance-request" } }, tx);
      }
    }
    await audit(
      actorOf(ctx),
      {
        action: statusChanged ? "maintenance.status_changed" : "maintenance.notes_updated",
        entityType: ENTITY,
        entityId: id,
        before: { status: before.status, notes: before.resolutionNotes },
        after: { status: row.status, notes: row.resolutionNotes },
        metadata: releaseBed ? { bedReleased: true } : undefined,
      },
      tx,
    );
    return row;
  });

  if (statusChanged) {
    const title = `Maintenance ${before.requestNumber}: ${maintenanceStatusLabels[input.status]}`;
    if (before.residentId) {
      await notifyResident(ctx.organizationId, before.residentId, {
        type: "MAINTENANCE_UPDATED",
        title,
        body: notes ?? before.title,
        link: "/portal",
      });
    }
    if (before.assignedStaff?.userId && before.assignedStaff.userId !== ctx.userId) {
      await notifyUsers(ctx.organizationId, [before.assignedStaff.userId], { type: "MAINTENANCE_UPDATED", title, body: before.title, link: link(id) });
    }
    if (!manager) {
      // Let managers know when field staff progress or finish a job.
      await notifyMembers(ctx.organizationId, "maintenance.manage", before.hostelId, { type: "MAINTENANCE_UPDATED", title, body: `${ctx.userName} · ${before.title}`, link: link(id) }, { excludeUserId: ctx.userId });
    }
  }
  return serialize(updated);
}

export async function addMaintenancePhotos(ctx: TenantContext, id: string, raw: MaintenancePhotosInput) {
  const input = parseInput(maintenancePhotosSchema, raw);
  const request = await loadForWrite(ctx, id);
  const manager = can(ctx, "maintenance.manage") && ctx.accessibleHostelIds.includes(request.hostelId);
  if (!manager && !isAssignedWorker(ctx, request)) throw new ForbiddenError();
  const ids = [...new Set(input.photoFileIds)];
  await prisma.$transaction(async (tx) => {
    await attachPhotos(tx, ctx, id, ids);
    await audit(actorOf(ctx), { action: "maintenance.photos_added", entityType: ENTITY, entityId: id, metadata: { count: ids.length } }, tx);
  });
  return { added: ids.length };
}

export async function removeMaintenancePhoto(ctx: TenantContext, id: string, fileId: string) {
  const request = await loadForWrite(ctx, id);
  assertManager(ctx, request);
  const file = await prisma.storedFile.findFirst({
    where: { id: fileId, organizationId: ctx.organizationId, maintenanceRequestId: id, deletedAt: null },
    select: { id: true, originalName: true },
  });
  if (!file) throw new NotFoundError("Photo");
  await prisma.$transaction(async (tx) => {
    await tx.storedFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
    await audit(actorOf(ctx), { action: "maintenance.photo_removed", entityType: ENTITY, entityId: id, metadata: { fileId: file.id, name: file.originalName } }, tx);
  });
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

/** Requests assigned to the member's linked staff profile (open ones, plus the last 7 days of completed). */
export async function listMyMaintenance(ctx: TenantContext) {
  requireAnyPermission(ctx, "tasks.view", "maintenance.work");
  if (!ctx.staffId) return [];
  const since = new Date(Date.now() - 7 * 86400_000);
  const rows = await prisma.maintenanceRequest.findMany({
    where: {
      organizationId: ctx.organizationId,
      assignedStaffId: ctx.staffId,
      OR: [{ status: { in: OPEN_STATUSES } }, { status: "COMPLETED", completedAt: { gte: since } }],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 100,
    include: listInclude,
  });
  return serialize(rows);
}
