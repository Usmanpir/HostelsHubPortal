import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ComplaintStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
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
  complaintAssignSchema,
  complaintEditSchema,
  complaintFiltersSchema,
  complaintSchema,
  complaintStatusSchema,
  COMPLAINT_ASSIGNEE_TRANSITIONS,
  COMPLAINT_MANAGER_TRANSITIONS,
  COMPLAINT_STATUSES,
  type ComplaintAssignInput,
  type ComplaintEditInput,
  type ComplaintFilters,
  type ComplaintInput,
  type ComplaintStatusInput,
} from "@/lib/validation/operations";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { nextCode } from "@/lib/sequence";
import { serialize } from "@/lib/serialize";
import { fullName } from "@/lib/format";
import { notifyMembers, notifyResident, notifyUsers } from "@/lib/notifications/notify";
import { complaintStatusLabels } from "@/config/labels";
import { assertAssignableStaff, assertResidentInHostel, assertWritableHostel, getEntityTimeline } from "./shared";

/** Mirrors EXPORT_ROW_LIMIT in src/lib/export.ts (not imported to keep exceljs out of action bundles). */
const EXPORT_LIMIT = 10_000;
const ENTITY = "Complaint";
const OPEN_STATUSES: ComplaintStatus[] = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS"];
const CLOSED_STATUSES: ComplaintStatus[] = ["RESOLVED", "CLOSED"];

const MANAGER_TRANSITIONS = COMPLAINT_MANAGER_TRANSITIONS;
const ASSIGNEE_TRANSITIONS = COMPLAINT_ASSIGNEE_TRANSITIONS;

const listInclude = {
  hostel: { select: { id: true, name: true, code: true } },
  resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
  assignedStaff: { select: { id: true, firstName: true, lastName: true, designation: true } },
} satisfies Prisma.ComplaintInclude;

// ─── Access ─────────────────────────────────────────────────────────────────

function isAssignee(ctx: TenantContext, complaint: { assignedStaffId: string | null }) {
  return can(ctx, "tasks.view") && !!ctx.staffId && complaint.assignedStaffId === ctx.staffId;
}

function recordScope(ctx: TenantContext): Prisma.ComplaintWhereInput {
  requireAnyPermission(ctx, "complaints.view", "tasks.view");
  const scopes: Prisma.ComplaintWhereInput[] = [];
  if (can(ctx, "complaints.view")) scopes.push(accessWhere(ctx));
  if (can(ctx, "tasks.view") && ctx.staffId) scopes.push({ organizationId: ctx.organizationId, assignedStaffId: ctx.staffId });
  if (scopes.length === 0) return { organizationId: ctx.organizationId, id: "__none__" };
  return { OR: scopes };
}

function allowedTransitions(status: ComplaintStatus, who: { manager: boolean; assignee: boolean }) {
  const set = new Set<ComplaintStatus>();
  if (who.manager) MANAGER_TRANSITIONS[status].forEach((s) => set.add(s));
  if (who.assignee) ASSIGNEE_TRANSITIONS[status].forEach((s) => set.add(s));
  return COMPLAINT_STATUSES.filter((s) => set.has(s));
}

function buildWhere(ctx: TenantContext, filters: ReturnType<typeof complaintFiltersSchema.parse>): Prisma.ComplaintWhereInput {
  requirePermission(ctx, "complaints.view");
  return {
    AND: [
      scopedWhere(ctx, filters.hostelId),
      filters.status ? { status: filters.status } : {},
      filters.state === "open" ? { status: { in: OPEN_STATUSES } } : filters.state === "closed" ? { status: { in: CLOSED_STATUSES } } : {},
      filters.priority ? { priority: filters.priority } : {},
      filters.category ? { category: filters.category } : {},
      filters.q
        ? {
            OR: [
              { complaintNumber: { contains: filters.q, mode: "insensitive" } },
              { title: { contains: filters.q, mode: "insensitive" } },
              { resident: { firstName: { contains: filters.q, mode: "insensitive" } } },
              { resident: { lastName: { contains: filters.q, mode: "insensitive" } } },
              { resident: { residentCode: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
}

function orderBy(filters: { sort?: string; dir?: "asc" | "desc" }): Prisma.ComplaintOrderByWithRelationInput[] {
  const dir = filters.dir ?? "desc";
  switch (filters.sort) {
    case "priority":
      return [{ priority: dir }, { createdAt: "desc" }];
    case "status":
      return [{ status: dir }, { createdAt: "desc" }];
    case "complaintNumber":
      return [{ complaintNumber: dir }];
    case "createdAt":
      return [{ createdAt: dir }];
    default:
      return [{ createdAt: "desc" }];
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listComplaints(ctx: TenantContext, raw: ComplaintFilters = {}) {
  const filters = parseInput(complaintFiltersSchema, raw);
  const where = buildWhere(ctx, filters);
  const { skip, take, page, pageSize } = paginate(filters);
  const [rows, total] = await Promise.all([
    prisma.complaint.findMany({ where, skip, take, orderBy: orderBy(filters), include: listInclude }),
    prisma.complaint.count({ where }),
  ]);
  return serialize(toPaginated(rows, total, page, pageSize));
}

export async function exportComplaints(ctx: TenantContext, raw: ComplaintFilters = {}) {
  const filters = parseInput(complaintFiltersSchema, { ...raw, page: 1, pageSize: 100 });
  return prisma.complaint.findMany({
    where: buildWhere(ctx, filters),
    orderBy: orderBy(filters),
    take: EXPORT_LIMIT,
    include: listInclude,
  });
}

export async function getComplaint(ctx: TenantContext, id: string) {
  const complaint = await prisma.complaint.findFirst({
    where: { AND: [{ id }, recordScope(ctx)] },
    include: {
      ...listInclude,
      resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true, designation: true, phone: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });
  if (!complaint) throw new NotFoundError("Complaint");
  const timeline = await getEntityTimeline(ctx, ENTITY, complaint.id);
  const manager = can(ctx, "complaints.manage") && ctx.accessibleHostelIds.includes(complaint.hostelId);
  const assignee = isAssignee(ctx, complaint);
  return serialize({
    ...complaint,
    timeline,
    access: { canManage: manager, isAssignee: assignee, allowedStatuses: allowedTransitions(complaint.status, { manager, assignee }) },
  });
}

/** Open complaints (OPEN / UNDER_REVIEW / IN_PROGRESS) visible to this member — for dashboards. */
export async function countOpenComplaints(ctx: TenantContext) {
  requirePermission(ctx, "complaints.view");
  const where: Prisma.ComplaintWhereInput = { ...scopedWhere(ctx), status: { in: OPEN_STATUSES } };
  const [total, urgent, unassigned] = await Promise.all([
    prisma.complaint.count({ where }),
    prisma.complaint.count({ where: { ...where, priority: { in: ["HIGH", "URGENT"] } } }),
    prisma.complaint.count({ where: { ...where, assignedStaffId: null } }),
  ]);
  return { total, urgent, unassigned };
}

export async function getComplaintSummary(ctx: TenantContext, hostelId?: string | null) {
  requirePermission(ctx, "complaints.view");
  const scope = scopedWhere(ctx, hostelId);
  const grouped = await prisma.complaint.groupBy({ by: ["status"], where: scope, _count: { _all: true } });
  const byStatus = Object.fromEntries(COMPLAINT_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0])) as Record<
    ComplaintStatus,
    number
  >;
  const since = new Date(Date.now() - 30 * 86400_000);
  const resolved = await prisma.complaint.findMany({
    where: { ...scope, resolvedAt: { gte: since } },
    select: { createdAt: true, resolvedAt: true },
    take: 1000,
  });
  const avgHours = resolved.length
    ? resolved.reduce((sum, c) => sum + (c.resolvedAt!.getTime() - c.createdAt.getTime()), 0) / resolved.length / 3600_000
    : null;
  return { byStatus, open: byStatus.OPEN + byStatus.UNDER_REVIEW + byStatus.IN_PROGRESS, resolvedLast30: resolved.length, avgResolutionHours: avgHours };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

function link(id: string) {
  return `/operations/complaints/${id}`;
}

export async function createComplaint(ctx: TenantContext, raw: ComplaintInput) {
  requirePermission(ctx, "complaints.manage");
  const input = parseInput(complaintSchema, raw);
  await assertWritableHostel(ctx, input.hostelId);
  const resident = input.residentId ? await assertResidentInHostel(ctx, input.hostelId, input.residentId) : null;
  const staff = input.assignedStaffId ? await assertAssignableStaff(ctx, input.hostelId, input.assignedStaffId) : null;

  const complaint = await prisma.$transaction(async (tx) => {
    const complaintNumber = await nextCode(tx, ctx.organizationId, "complaint", "CMP", 5);
    const created = await tx.complaint.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: input.hostelId,
        complaintNumber,
        residentId: resident?.id ?? null,
        submittedById: ctx.userId,
        category: input.category,
        priority: input.priority,
        title: input.title,
        description: input.description,
        assignedStaffId: staff?.id ?? null,
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "complaint.created",
        entityType: ENTITY,
        entityId: created.id,
        after: { complaintNumber, title: created.title, category: created.category, priority: created.priority, assignedStaff: staff ? fullName(staff) : null },
      },
      tx,
    );
    return created;
  });

  const payload = { type: "COMPLAINT_UPDATED" as const, title: `New complaint ${complaint.complaintNumber}`, body: complaint.title, link: link(complaint.id) };
  await notifyMembers(ctx.organizationId, "complaints.manage", complaint.hostelId, payload, { excludeUserId: ctx.userId });
  if (staff?.userId && staff.userId !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [staff.userId], { ...payload, title: `Complaint assigned to you: ${complaint.complaintNumber}` });
  }
  if (resident) {
    await notifyResident(ctx.organizationId, resident.id, {
      type: "COMPLAINT_UPDATED",
      title: `Complaint ${complaint.complaintNumber} received`,
      body: complaint.title,
      link: "/portal",
    });
  }
  return serialize(complaint);
}

async function loadForWrite(ctx: TenantContext, id: string) {
  const complaint = await prisma.complaint.findFirst({
    where: { AND: [{ id }, recordScope(ctx)] },
    include: { assignedStaff: { select: { id: true, userId: true, firstName: true, lastName: true } } },
  });
  if (!complaint) throw new NotFoundError("Complaint");
  return complaint;
}

function assertManager(ctx: TenantContext, complaint: { hostelId: string }) {
  requirePermission(ctx, "complaints.manage");
  assertHostelAccess(ctx, complaint.hostelId);
}

export async function updateComplaint(ctx: TenantContext, id: string, raw: ComplaintEditInput) {
  const input = parseInput(complaintEditSchema, raw);
  const before = await loadForWrite(ctx, id);
  assertManager(ctx, before);
  const resident = input.residentId ? await assertResidentInHostel(ctx, before.hostelId, input.residentId) : null;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.complaint.update({
      where: { id },
      data: {
        residentId: resident?.id ?? null,
        category: input.category,
        priority: input.priority,
        title: input.title,
        description: input.description,
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "complaint.updated",
        entityType: ENTITY,
        entityId: id,
        before: { title: before.title, category: before.category, priority: before.priority, residentId: before.residentId },
        after: { title: row.title, category: row.category, priority: row.priority, residentId: row.residentId },
      },
      tx,
    );
    return row;
  });
  return serialize(updated);
}

export async function assignComplaint(ctx: TenantContext, id: string, raw: ComplaintAssignInput) {
  const input = parseInput(complaintAssignSchema, raw);
  const before = await loadForWrite(ctx, id);
  assertManager(ctx, before);
  if (CLOSED_STATUSES.includes(before.status)) throw new BusinessRuleError("Reopen this complaint before changing the assignee.");
  const staff = input.assignedStaffId ? await assertAssignableStaff(ctx, before.hostelId, input.assignedStaffId) : null;
  if ((staff?.id ?? null) === before.assignedStaffId) return serialize(before);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.complaint.update({ where: { id }, data: { assignedStaffId: staff?.id ?? null } });
    await audit(
      actorOf(ctx),
      {
        action: staff ? "complaint.assigned" : "complaint.unassigned",
        entityType: ENTITY,
        entityId: id,
        before: { assignedStaff: before.assignedStaff ? fullName(before.assignedStaff) : null },
        after: { assignedStaff: staff ? fullName(staff) : null },
      },
      tx,
    );
    return row;
  });
  if (staff?.userId && staff.userId !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [staff.userId], {
      type: "COMPLAINT_UPDATED",
      title: `Complaint assigned to you: ${before.complaintNumber}`,
      body: before.title,
      link: link(id),
    });
  }
  return serialize(updated);
}

export async function updateComplaintStatus(ctx: TenantContext, id: string, raw: ComplaintStatusInput) {
  const input = parseInput(complaintStatusSchema, raw);
  const before = await loadForWrite(ctx, id);
  const manager = can(ctx, "complaints.manage") && ctx.accessibleHostelIds.includes(before.hostelId);
  const assignee = isAssignee(ctx, before);
  if (!manager && !assignee) throw new ForbiddenError();
  if (input.status === before.status) {
    throw new BusinessRuleError(`This complaint is already ${complaintStatusLabels[before.status].toLowerCase()}.`);
  }
  if (!allowedTransitions(before.status, { manager, assignee }).includes(input.status)) {
    throw new BusinessRuleError(
      `A complaint that is ${complaintStatusLabels[before.status].toLowerCase()} can't be moved to ${complaintStatusLabels[input.status].toLowerCase()}.`,
    );
  }

  const reopening = OPEN_STATUSES.includes(input.status);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.complaint.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === "RESOLVED" ? { resolution: input.resolution ?? null, resolvedAt: new Date() } : {}),
        ...(input.status === "CLOSED" && input.resolution ? { resolution: input.resolution } : {}),
        ...(reopening ? { resolvedAt: null } : {}),
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "complaint.status_changed",
        entityType: ENTITY,
        entityId: id,
        before: { status: before.status, resolution: before.resolution },
        after: { status: row.status, resolution: row.resolution },
        metadata: input.resolution ? { note: input.resolution } : undefined,
      },
      tx,
    );
    return row;
  });

  const title = `Complaint ${before.complaintNumber}: ${complaintStatusLabels[input.status]}`;
  if (before.residentId) {
    await notifyResident(ctx.organizationId, before.residentId, {
      type: "COMPLAINT_UPDATED",
      title,
      body: input.status === "RESOLVED" ? (input.resolution ?? before.title) : before.title,
      link: "/portal",
    });
  }
  if (before.assignedStaff?.userId && before.assignedStaff.userId !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [before.assignedStaff.userId], { type: "COMPLAINT_UPDATED", title, body: before.title, link: link(id) });
  }
  if (!manager) {
    await notifyMembers(ctx.organizationId, "complaints.manage", before.hostelId, { type: "COMPLAINT_UPDATED", title, body: `${ctx.userName} · ${before.title}`, link: link(id) }, { excludeUserId: ctx.userId });
  }
  return serialize(updated);
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

/** Complaints assigned to the member's staff profile (open ones, plus the last 7 days of resolved). */
export async function listMyComplaints(ctx: TenantContext) {
  requirePermission(ctx, "tasks.view");
  if (!ctx.staffId) return [];
  const since = new Date(Date.now() - 7 * 86400_000);
  const rows = await prisma.complaint.findMany({
    where: {
      organizationId: ctx.organizationId,
      assignedStaffId: ctx.staffId,
      OR: [{ status: { in: OPEN_STATUSES } }, { status: "RESOLVED", resolvedAt: { gte: since } }],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 100,
    include: listInclude,
  });
  return serialize(rows);
}
