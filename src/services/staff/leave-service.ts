import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ApprovalStatus, LeaveType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import { actorOf, can, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { leaveReviewSchema, leaveSchema, type LeaveInput, type LeaveReviewInput } from "@/lib/validation/staff";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { serialize } from "@/lib/serialize";
import { dateOnly, formatDate, fullName } from "@/lib/format";
import { notifyMembers, notifyUsers } from "@/lib/notifications/notify";
import { staffAccessWhere, staffScopeWhere } from "./scope";

const DAY = 86400_000;

/** Inclusive number of calendar days in a leave. */
export function leaveDays(startDate: Date, endDate: Date) {
  return Math.round((endDate.getTime() - startDate.getTime()) / DAY) + 1;
}

export type LeaveListFilters = {
  q?: string;
  status?: ApprovalStatus;
  type?: LeaveType;
  staffId?: string;
  hostelId?: string | null;
  page?: number;
  pageSize?: number;
};

export async function listLeaves(ctx: TenantContext, filters: LeaveListFilters = {}) {
  requirePermission(ctx, "leave.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where: Prisma.StaffLeaveWhereInput = {
    organizationId: ctx.organizationId,
    staff: {
      ...staffScopeWhere(ctx, filters.hostelId),
      ...(filters.q
        ? {
            OR: [
              { firstName: { contains: filters.q, mode: "insensitive" } },
              { lastName: { contains: filters.q, mode: "insensitive" } },
              { employeeCode: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
  };
  const [rows, total, pending] = await Promise.all([
    prisma.staffLeave.findMany({
      where,
      skip,
      take,
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: {
        staff: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } },
        reviewedBy: { select: { name: true } },
      },
    }),
    prisma.staffLeave.count({ where }),
    prisma.staffLeave.count({
      where: { organizationId: ctx.organizationId, status: "PENDING", staff: staffScopeWhere(ctx, filters.hostelId) },
    }),
  ]);
  const items = rows.map((l) => ({ ...l, days: leaveDays(l.startDate, l.endDate) }));
  return serialize({ ...toPaginated(items, total, page, pageSize), pendingCount: pending });
}

/** Staff a member may file leave for: everyone in scope with leave.manage, otherwise only themself. */
export async function listLeaveStaffOptions(ctx: TenantContext) {
  requirePermission(ctx, "leave.view");
  const manage = can(ctx, "leave.manage");
  if (!manage && !ctx.staffId) return [];
  const staff = await prisma.staff.findMany({
    where: {
      ...(manage ? staffScopeWhere(ctx) : { organizationId: ctx.organizationId, id: ctx.staffId! }),
      archivedAt: null,
      status: { in: ["ACTIVE", "ON_LEAVE"] },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
  });
  return staff.map((s) => ({ id: s.id, name: fullName(s), employeeCode: s.employeeCode }));
}

export async function createLeave(ctx: TenantContext, raw: LeaveInput) {
  requirePermission(ctx, "leave.view");
  const input = parseInput(leaveSchema, raw);
  // Recording leave for someone else needs leave.manage; staff may request their own.
  if (input.staffId !== ctx.staffId) requirePermission(ctx, "leave.manage");
  const staff = await prisma.staff.findFirst({
    where: { id: input.staffId, ...staffAccessWhere(ctx), archivedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      hostels: { orderBy: { isPrimary: "desc" }, take: 1, select: { hostelId: true } },
    },
  });
  if (!staff) throw new NotFoundError("Staff member");
  const startDate = dateOnly(input.startDate);
  const endDate = dateOnly(input.endDate);

  const overlap = await prisma.staffLeave.findFirst({
    where: {
      staffId: staff.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { startDate: true, endDate: true, status: true },
  });
  if (overlap) {
    throw new ConflictError(
      `This overlaps an existing ${overlap.status.toLowerCase()} leave (${formatDate(overlap.startDate)} – ${formatDate(overlap.endDate)}).`,
    );
  }

  const leave = await prisma.$transaction(async (tx) => {
    const row = await tx.staffLeave.create({
      data: {
        organizationId: ctx.organizationId,
        staffId: staff.id,
        type: input.type,
        startDate,
        endDate,
        reason: input.reason ?? null,
      },
    });
    await audit(actorOf(ctx), { action: "leave.requested", entityType: "StaffLeave", entityId: row.id, after: row }, tx);
    return row;
  });

  // Self-service requests go to whoever approves leave for that hostel.
  if (staff.id === ctx.staffId) {
    await notifyMembers(
      ctx.organizationId,
      "leave.manage",
      staff.hostels[0]?.hostelId ?? null,
      {
        type: "REQUEST_UPDATED",
        title: `Leave request from ${fullName(staff)}`,
        body: `${formatDate(startDate)} – ${formatDate(endDate)}`,
        link: "/staff/leave?status=PENDING",
      },
      { excludeUserId: ctx.userId },
    );
  }
  return serialize(leave);
}

export async function reviewLeave(ctx: TenantContext, id: string, raw: LeaveReviewInput) {
  requirePermission(ctx, "leave.manage");
  const input = parseInput(leaveReviewSchema, raw);
  const leave = await prisma.staffLeave.findFirst({
    where: { id, organizationId: ctx.organizationId, staff: staffAccessWhere(ctx) },
    include: { staff: { select: { firstName: true, lastName: true, userId: true } } },
  });
  if (!leave) throw new NotFoundError("Leave request");
  if (input.decision === "CANCELLED") {
    if (leave.status !== "PENDING" && leave.status !== "APPROVED") {
      throw new BusinessRuleError("Only pending or approved leave can be cancelled.");
    }
  } else if (leave.status !== "PENDING") {
    throw new BusinessRuleError(`This request has already been ${leave.status.toLowerCase()}.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.staffLeave.update({
      where: { id },
      data: { status: input.decision, reviewedById: ctx.userId, reviewedAt: new Date() },
    });
    await audit(
      actorOf(ctx),
      {
        action: `leave.${input.decision.toLowerCase()}`,
        entityType: "StaffLeave",
        entityId: id,
        before: { status: leave.status },
        after: { status: row.status, reviewedById: ctx.userId },
      },
      tx,
    );
    return row;
  });

  // Let a linked employee know the outcome (never the reviewer themself).
  if (leave.staff.userId && leave.staff.userId !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [leave.staff.userId], {
      type: "REQUEST_UPDATED",
      title: `Leave ${input.decision.toLowerCase()}`,
      body: `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`,
    });
  }
  return serialize(updated);
}
