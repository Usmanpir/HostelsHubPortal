import { prisma, type Tx } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AssignmentStatus, ChargeType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  accessWhere,
  actorOf,
  assertHostelAccess,
  can,
  requirePermission,
  scopedWhere,
  type TenantContext,
} from "@/lib/tenant/context";
import {
  activateReservationSchema,
  cancelReservationSchema,
  checkInSchema,
  checkOutSchema,
  renewLeaseSchema,
  transferSchema,
  type ActivateReservationInput,
  type CancelReservationInput,
  type CheckInInput,
  type CheckOutInput,
  type RenewLeaseInput,
  type TransferInput,
} from "@/lib/validation/resident";
import { invoiceSchema } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { assertWithinLimit } from "@/lib/subscription/limits";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { dateOnly, formatDate, formatMoney, fullName, todayInTimeZone } from "@/lib/format";
import { EXPORT_ROW_LIMIT } from "@/lib/export";
import { notifyMembers, notifyResident } from "@/lib/notifications/notify";
import { bedStatusLabels, chargeTypeLabels, roomStatusLabels } from "@/config/labels";
import { claimUpload } from "@/services/files/file-service";
import { createInvoiceTx } from "@/services/finance/invoice-service";
import { recordRefundTx } from "@/services/finance/payment-service";
import { getResidentBalance } from "@/services/finance/ledger";
import { refreshRoomStatus } from "@/services/hostel/occupancy";
import {
  addMonthsUtc,
  lockBeds,
  lockResident,
  LIVE_ASSIGNMENT_STATUSES,
  mapAssignmentConflict,
  placementLabel,
} from "./shared";

function today(ctx: TenantContext) {
  return dateOnly(todayInTimeZone(ctx.organization.timezone));
}

function assertNotFuture(ctx: TenantContext, date: Date, field: string, message: string) {
  if (dateOnly(date) > today(ctx)) throw new ValidationError(message, { [field]: [message] });
}

/** Rent for a bed: bed override → room rent → hostel default. */
export function effectiveBedRent(bed: { monthlyRent: unknown }, room: { rent: unknown }, hostel: { defaultBedRent: unknown }) {
  const pick = (v: unknown) => (v === null || v === undefined ? null : toNumber(v as Prisma.Decimal | number));
  return pick(bed.monthlyRent) ?? pick(room.rent) ?? pick(hostel.defaultBedRent) ?? 0;
}

/** Default months between automatic rent increments when only a percentage is given. */
export const DEFAULT_INCREMENT_INTERVAL_MONTHS = 12;
/** A lease is "expiring soon" within this many days of its end date. */
export const LEASE_EXPIRING_DAYS = 30;

/**
 * Normalise lease inputs into assignment columns. An increment percentage
 * without an interval uses 12 months; the first increment is scheduled one
 * interval after `startDate`.
 */
export function leaseColumns(
  input: {
    leaseEndDate?: Date | null;
    noticePeriodDays?: number | null;
    advanceRent?: number | null;
    rentIncrementPercent?: number | null;
    incrementIntervalMonths?: number | null;
    leaseTerms?: string | null;
  },
  startDate: Date,
) {
  const pct = input.rentIncrementPercent && input.rentIncrementPercent > 0 ? round2(input.rentIncrementPercent) : null;
  const interval = pct ? (input.incrementIntervalMonths ?? DEFAULT_INCREMENT_INTERVAL_MONTHS) : (input.incrementIntervalMonths ?? null);
  return {
    leaseEndDate: input.leaseEndDate ? dateOnly(input.leaseEndDate) : null,
    noticePeriodDays: input.noticePeriodDays ?? null,
    advanceRent: input.advanceRent && input.advanceRent > 0 ? round2(input.advanceRent) : null,
    rentIncrementPercent: pct,
    incrementIntervalMonths: interval,
    nextIncrementDate: pct && interval ? addMonthsUtc(dateOnly(startDate), interval) : null,
    leaseTerms: input.leaseTerms ?? null,
  };
}

// ─── Pickers for the check-in / transfer workflows ──────────────────────────

/** Hostels the member can place residents in, with rent defaults. */
export async function listAssignableHostels(ctx: TenantContext) {
  requirePermission(ctx, "assignments.manage");
  const hostels = await prisma.hostel.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      status: "ACTIVE",
      ...(ctx.allHostels ? {} : { id: { in: ctx.accessibleHostelIds } }),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      defaultBedRent: true,
      defaultDeposit: true,
      admissionFee: true,
      rentalMode: true,
      kind: true,
    },
  });
  const available = await prisma.bed.groupBy({
    by: ["hostelId"],
    where: {
      organizationId: ctx.organizationId,
      hostelId: { in: hostels.map((h) => h.id) },
      archivedAt: null,
      status: "AVAILABLE",
      room: { archivedAt: null, status: { notIn: ["MAINTENANCE", "INACTIVE"] } },
    },
    _count: { _all: true },
  });
  return serialize(
    hostels.map((h) => ({ ...h, availableBeds: available.find((a) => a.hostelId === h.id)?._count._all ?? 0 })),
  );
}

/**
 * Floors → rooms → beds of a hostel for the visual bed picker. Every bed is
 * returned (so the room reads naturally) with a `selectable` flag.
 */
export async function getHostelBedMap(ctx: TenantContext, hostelId: string) {
  requirePermission(ctx, "assignments.manage");
  assertHostelAccess(ctx, hostelId);
  const hostel = await prisma.hostel.findFirst({
    where: { id: hostelId, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true, name: true, defaultBedRent: true, defaultDeposit: true, admissionFee: true, rentalMode: true },
  });
  if (!hostel) throw new NotFoundError("Hostel");
  const floors = await prisma.floor.findMany({
    where: { hostelId, organizationId: ctx.organizationId, archivedAt: null },
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
          status: true,
          rent: true,
          beds: {
            where: { archivedAt: null },
            orderBy: { bedNumber: "asc" },
            select: {
              id: true,
              bedNumber: true,
              status: true,
              monthlyRent: true,
              assignments: {
                where: { status: { in: LIVE_ASSIGNMENT_STATUSES } },
                take: 1,
                select: { resident: { select: { firstName: true, lastName: true } } },
              },
            },
          },
        },
      },
    },
  });

  const result = floors.map((f) => ({
    id: f.id,
    name: f.name,
    floorNumber: f.floorNumber,
    rooms: f.rooms.map((r) => {
      const roomOpen = r.status !== "MAINTENANCE" && r.status !== "INACTIVE";
      const live = r.beds.filter((b) => b.assignments.length > 0).length;
      const hasRoom = live < r.capacity;
      const beds = r.beds.map((b) => ({
        id: b.id,
        bedNumber: b.bedNumber,
        status: b.status,
        rent: effectiveBedRent(b, r, hostel),
        residentName: b.assignments[0] ? fullName(b.assignments[0].resident) : null,
        selectable: roomOpen && hasRoom && b.status === "AVAILABLE",
      }));
      return {
        id: r.id,
        roomNumber: r.roomNumber,
        roomType: r.roomType,
        capacity: r.capacity,
        status: r.status,
        blockedReason: !roomOpen ? roomStatusLabels[r.status] : null,
        availableBeds: beds.filter((b) => b.selectable).length,
        beds,
      };
    }),
  }));
  return serialize({
    hostel,
    floors: result.map((f) => ({ ...f, availableBeds: f.rooms.reduce((s, r) => s + r.availableBeds, 0) })),
  });
}

/** Resolve hostel / floor / room for `?bedId=` deep links. */
export async function getBedPlacement(ctx: TenantContext, bedId: string) {
  requirePermission(ctx, "assignments.manage");
  const bed = await prisma.bed.findFirst({
    where: { id: bedId, ...accessWhere(ctx), archivedAt: null },
    select: { id: true, hostelId: true, roomId: true, room: { select: { floorId: true } } },
  });
  if (!bed) return null;
  return { bedId: bed.id, hostelId: bed.hostelId, roomId: bed.roomId, floorId: bed.room.floorId };
}

export type AssignableMode = "check-in" | "check-out";

/**
 * Resident search for the workflows: check-in lists residents without a bed
 * (incl. checked-out residents who can be re-admitted); check-out lists
 * residents with an active stay.
 */
export async function searchAssignableResidents(
  ctx: TenantContext,
  params: { q?: string; mode: AssignableMode; residentId?: string },
) {
  requirePermission(ctx, "assignments.manage");
  const terms = (params.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const where: Prisma.ResidentWhereInput = {
    ...accessWhere(ctx),
    archivedAt: null,
    ...(params.mode === "check-in"
      ? {
          status: { in: ["ACTIVE", "NOTICE", "CHECKED_OUT"] },
          assignments: { none: { status: { in: LIVE_ASSIGNMENT_STATUSES } } },
        }
      : { assignments: { some: { status: "ACTIVE" } } }),
    ...(params.residentId
      ? { id: params.residentId }
      : terms.length
        ? {
            AND: terms.map((t) => ({
              OR: [
                { firstName: { contains: t, mode: "insensitive" as const } },
                { lastName: { contains: t, mode: "insensitive" as const } },
                { residentCode: { contains: t, mode: "insensitive" as const } },
                { phone: { contains: t } },
                { idNumber: { contains: t, mode: "insensitive" as const } },
              ],
            })),
          }
        : {}),
  };
  const rows = await prisma.resident.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 12,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      residentCode: true,
      phone: true,
      status: true,
      photoFileId: true,
      hostelId: true,
      hostel: { select: { name: true } },
      assignments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: { id: true, room: { select: { roomNumber: true } }, bed: { select: { bedNumber: true } } },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: fullName(r),
    code: r.residentCode,
    phone: r.phone,
    status: r.status,
    photoFileId: r.photoFileId,
    hostelId: r.hostelId,
    hostelName: r.hostel.name,
    placement: r.assignments[0] ? placementLabel(r.assignments[0]) : null,
  }));
}

/** Everything the check-out screen needs: stay, deposit and account balance. */
export async function getCheckOutPreview(ctx: TenantContext, residentId: string) {
  requirePermission(ctx, "assignments.manage");
  const assignment = await prisma.residentAssignment.findFirst({
    where: { activeResidentId: residentId, status: "ACTIVE", ...accessWhere(ctx) },
    include: {
      resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true, photoFileId: true } },
      hostel: { select: { id: true, name: true, rentalMode: true } },
      room: { select: { id: true, roomNumber: true, floor: { select: { name: true } } } },
      bed: { select: { id: true, bedNumber: true } },
    },
  });
  if (!assignment) throw new NotFoundError("Active stay");
  const balance = await getResidentBalance(ctx.organizationId, residentId);
  return serialize({
    assignment: { ...assignment, label: placementLabel(assignment) },
    resident: { ...assignment.resident, name: fullName(assignment.resident) },
    balance,
    canInvoice: can(ctx, "invoices.manage"),
    canRefund: can(ctx, "payments.manage"),
  });
}

// ─── Shared transaction steps ───────────────────────────────────────────────

const targetBedInclude = {
  room: { select: { id: true, roomNumber: true, capacity: true, status: true, archivedAt: true, rent: true, floorId: true } },
  hostel: { select: { id: true, name: true, status: true, archivedAt: true, admissionFee: true, defaultBedRent: true, rentalMode: true } },
} satisfies Prisma.BedInclude;

/** Validate a (locked) bed can take a new live assignment. */
async function loadTargetBed(tx: Tx, ctx: TenantContext, bedId: string) {
  const bed = await tx.bed.findFirst({ where: { id: bedId, organizationId: ctx.organizationId }, include: targetBedInclude });
  if (!bed) throw new NotFoundError("Bed");
  assertHostelAccess(ctx, bed.hostelId);
  const label = placementLabel({ roomNumber: bed.room.roomNumber, bedNumber: bed.bedNumber }, bed.hostel.rentalMode === "WHOLE_UNIT");
  if (bed.archivedAt || bed.room.archivedAt || bed.hostel.archivedAt) throw new BusinessRuleError(`${label} is no longer in service.`);
  if (bed.hostel.status !== "ACTIVE") throw new BusinessRuleError(`${bed.hostel.name} is not active. Activate the hostel before placing residents.`);
  if (bed.room.status === "MAINTENANCE" || bed.room.status === "INACTIVE") {
    throw new BusinessRuleError(`Room ${bed.room.roomNumber} is ${roomStatusLabels[bed.room.status].toLowerCase()} and can't take residents.`);
  }
  if (bed.status !== "AVAILABLE") {
    throw new BusinessRuleError(`${label} is ${bedStatusLabels[bed.status].toLowerCase()}. Pick an available bed.`);
  }
  return bed;
}

/** Room capacity guard (counted inside the transaction, after any bed was freed). */
async function assertRoomHasSpace(tx: Tx, room: { id: string; roomNumber: string; capacity: number }) {
  const live = await tx.residentAssignment.count({ where: { roomId: room.id, status: { in: LIVE_ASSIGNMENT_STATUSES } } });
  if (live >= room.capacity) {
    throw new BusinessRuleError(`Room ${room.roomNumber} is at its capacity of ${room.capacity}.`);
  }
}

async function attachAssignmentDocument(
  tx: Tx,
  ctx: TenantContext,
  residentId: string,
  fileId: string,
  type: "AGREEMENT" | "CLEARANCE",
  title: string,
) {
  await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, fileId, ["assignment-document", "resident-document"]);
  return tx.residentDocument.create({ data: { organizationId: ctx.organizationId, residentId, fileId, type, title } });
}

// ─── Check-in ───────────────────────────────────────────────────────────────

export async function checkIn(ctx: TenantContext, raw: CheckInInput) {
  requirePermission(ctx, "assignments.manage");
  const input = parseInput(checkInSchema, raw);
  const checkInDate = dateOnly(input.checkInDate);
  if (!input.reserveOnly) {
    assertNotFuture(ctx, checkInDate, "checkInDate", "Check-in can't be in the future. Use “Reserve only” to hold the bed.");
  }
  const lease = leaseColumns(input, checkInDate);
  if (lease.leaseEndDate && lease.leaseEndDate < checkInDate) {
    throw new ValidationError("Lease end must be on or after the move-in date.", { leaseEndDate: ["Must be on or after the move-in date"] });
  }

  const pre = await prisma.resident.findFirst({ where: { id: input.residentId, ...accessWhere(ctx) }, select: { status: true } });
  if (!pre) throw new NotFoundError("Resident");
  // Re-admitting a checked-out resident makes them count against the plan again.
  if (pre.status === "CHECKED_OUT") await assertWithinLimit(prisma, ctx.organizationId, "residents");

  const canInvoice = can(ctx, "invoices.manage");
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockResident(tx, ctx.organizationId, input.residentId);
      await lockBeds(tx, ctx.organizationId, [input.bedId]);
      const bed = await loadTargetBed(tx, ctx, input.bedId);

      const resident = await tx.resident.findFirst({ where: { id: input.residentId, ...accessWhere(ctx) } });
      if (!resident) throw new NotFoundError("Resident");
      if (resident.archivedAt || resident.status === "ARCHIVED") throw new BusinessRuleError("Restore this resident before checking them in.");
      if (resident.status === "SUSPENDED") throw new BusinessRuleError("This resident is suspended. Reactivate their profile before checking them in.");
      const existing = await tx.residentAssignment.findFirst({
        where: { activeResidentId: resident.id },
        include: { room: { select: { roomNumber: true } }, bed: { select: { bedNumber: true } } },
      });
      if (existing) {
        throw new BusinessRuleError(
          `${fullName(resident)} already has a ${existing.status === "RESERVED" ? "reservation" : "bed"} (${placementLabel(existing)}). Use a transfer instead.`,
        );
      }
      await assertRoomHasSpace(tx, bed.room);

      const status: AssignmentStatus = input.reserveOnly ? "RESERVED" : "ACTIVE";
      const assignment = await tx.residentAssignment.create({
        data: {
          organizationId: ctx.organizationId,
          residentId: resident.id,
          hostelId: bed.hostelId,
          roomId: bed.roomId,
          bedId: bed.id,
          status,
          checkInDate,
          monthlyRent: input.monthlyRent,
          securityDeposit: input.securityDeposit,
          activeBedId: bed.id,
          activeResidentId: resident.id,
          notes: input.notes ?? null,
          createdById: ctx.userId,
          ...lease,
        },
      });
      await tx.bed.update({ where: { id: bed.id }, data: { status: input.reserveOnly ? "RESERVED" : "OCCUPIED" } });
      await tx.resident.update({
        where: { id: resident.id },
        data: {
          hostelId: bed.hostelId,
          status: resident.status === "NOTICE" ? "NOTICE" : "ACTIVE",
          actualLeavingDate: null,
        },
      });
      await refreshRoomStatus(tx, bed.roomId);

      const label = placementLabel({ roomNumber: bed.room.roomNumber, bedNumber: bed.bedNumber }, bed.hostel.rentalMode === "WHOLE_UNIT");
      if (input.agreementFileId) {
        await attachAssignmentDocument(tx, ctx, resident.id, input.agreementFileId, "AGREEMENT", `Agreement — ${label} (${formatDate(checkInDate)})`);
      }

      let invoice: Awaited<ReturnType<typeof createInvoiceTx>> | null = null;
      if (input.generateInvoice && canInvoice) {
        const opts = input.generateInvoice;
        const items: { type: ChargeType; description: string; quantity: number; unitPrice: number }[] = [];
        const periodEnd = addMonthsUtc(checkInDate, 1, 1);
        if (opts.includeRent && input.monthlyRent > 0) {
          items.push({
            type: "MONTHLY_RENT",
            description: `${chargeTypeLabels.MONTHLY_RENT} — ${label} (${formatDate(checkInDate)} – ${formatDate(periodEnd)})`,
            quantity: 1,
            unitPrice: input.monthlyRent,
          });
        }
        if (opts.includeDeposit && input.securityDeposit > 0) {
          items.push({ type: "SECURITY_DEPOSIT", description: chargeTypeLabels.SECURITY_DEPOSIT, quantity: 1, unitPrice: input.securityDeposit });
        }
        if (lease.advanceRent && lease.advanceRent > 0) {
          items.push({ type: "OTHER", description: "Advance rent", quantity: 1, unitPrice: lease.advanceRent });
        }
        const admissionFee = toNumber(bed.hostel.admissionFee);
        if (opts.includeAdmissionFee && admissionFee > 0) {
          items.push({ type: "ADMISSION_FEE", description: chargeTypeLabels.ADMISSION_FEE, quantity: 1, unitPrice: admissionFee });
        }
        if (items.length > 0) {
          invoice = await createInvoiceTx(
            tx,
            ctx,
            invoiceSchema.parse({
              residentId: resident.id,
              assignmentId: assignment.id,
              issueDate: checkInDate,
              ...(opts.includeRent && input.monthlyRent > 0 ? { periodStart: checkInDate, periodEnd } : {}),
              items,
              notes: input.reserveOnly ? `Booking for ${label}` : `First invoice for ${label}`,
            }),
          );
        }
      }

      await audit(
        actorOf(ctx),
        {
          action: input.reserveOnly ? "assignment.reserved" : "assignment.checked_in",
          entityType: "ResidentAssignment",
          entityId: assignment.id,
          after: assignment,
          metadata: { residentId: resident.id, bed: label, hostel: bed.hostel.name, invoiceId: invoice?.id ?? null },
        },
        tx,
      );
      return { assignment, resident, hostel: bed.hostel, label, invoice };
    });
  } catch (error) {
    throw mapAssignmentConflict(error);
  }

  const name = fullName(result.resident);
  const where = `${result.hostel.name} · ${result.label}`;
  await notifyResident(ctx.organizationId, result.resident.id, {
    type: input.reserveOnly ? "ROOM_ASSIGNED" : "CHECK_IN",
    title: input.reserveOnly ? "A bed has been reserved for you" : `Welcome to ${result.hostel.name}`,
    body: input.reserveOnly ? `${where}, from ${formatDate(checkInDate)}` : `You're checked in to ${where}.`,
    link: "/portal",
  });
  if (result.invoice && result.invoice.status !== "DRAFT") {
    await notifyResident(ctx.organizationId, result.resident.id, {
      type: "INVOICE_CREATED",
      title: `New invoice ${result.invoice.invoiceNumber}`,
      body: `Amount due: ${formatMoney(toNumber(result.invoice.total), ctx.organization.currency)} by ${formatDate(result.invoice.dueDate)}`,
      link: `/portal/invoices/${result.invoice.id}`,
    });
  }
  await notifyMembers(
    ctx.organizationId,
    "residents.view",
    result.hostel.id,
    {
      type: "CHECK_IN",
      title: input.reserveOnly ? `${name} reserved ${result.label}` : `${name} checked in`,
      body: where,
      link: `/residents/${result.resident.id}`,
    },
    { excludeUserId: ctx.userId },
  );
  return serialize({ assignment: result.assignment, invoiceId: result.invoice?.id ?? null });
}

// ─── Reservations ───────────────────────────────────────────────────────────

async function loadReservation(tx: Tx, ctx: TenantContext, assignmentId: string) {
  const assignment = await tx.residentAssignment.findFirst({
    where: { id: assignmentId, ...accessWhere(ctx) },
    include: {
      resident: { select: { id: true, firstName: true, lastName: true, status: true } },
      hostel: { select: { id: true, name: true, rentalMode: true } },
      room: { select: { roomNumber: true } },
      bed: { select: { bedNumber: true } },
    },
  });
  if (!assignment) throw new NotFoundError("Reservation");
  if (assignment.status !== "RESERVED") throw new BusinessRuleError("This stay is not a reservation.");
  return assignment;
}

/** RESERVED → ACTIVE: the resident moves in. */
export async function activateReservation(ctx: TenantContext, assignmentId: string, checkInDateRaw: ActivateReservationInput["checkInDate"]) {
  requirePermission(ctx, "assignments.manage");
  const input = parseInput(activateReservationSchema, { assignmentId, checkInDate: checkInDateRaw });
  const checkInDate = dateOnly(input.checkInDate);
  assertNotFuture(ctx, checkInDate, "checkInDate", "Check-in can't be in the future.");

  const result = await prisma.$transaction(async (tx) => {
    const first = await loadReservation(tx, ctx, input.assignmentId);
    await lockBeds(tx, ctx.organizationId, [first.bedId]);
    const assignment = await loadReservation(tx, ctx, input.assignmentId);
    const updated = await tx.residentAssignment.update({ where: { id: assignment.id }, data: { status: "ACTIVE", checkInDate } });
    await tx.bed.update({ where: { id: assignment.bedId }, data: { status: "OCCUPIED" } });
    if (assignment.resident.status !== "NOTICE") {
      await tx.resident.update({ where: { id: assignment.residentId }, data: { status: "ACTIVE" } });
    }
    await refreshRoomStatus(tx, assignment.roomId);
    await audit(
      actorOf(ctx),
      {
        action: "assignment.checked_in",
        entityType: "ResidentAssignment",
        entityId: assignment.id,
        before: { status: assignment.status, checkInDate: assignment.checkInDate },
        after: { status: updated.status, checkInDate: updated.checkInDate },
        metadata: { fromReservation: true },
      },
      tx,
    );
    return { assignment, updated };
  });

  const label = placementLabel(result.assignment);
  await notifyResident(ctx.organizationId, result.assignment.residentId, {
    type: "CHECK_IN",
    title: `Welcome to ${result.assignment.hostel.name}`,
    body: `You're checked in to ${label}.`,
    link: "/portal",
  });
  await notifyMembers(
    ctx.organizationId,
    "residents.view",
    result.assignment.hostelId,
    { type: "CHECK_IN", title: `${fullName(result.assignment.resident)} checked in`, body: `${result.assignment.hostel.name} · ${label}`, link: `/residents/${result.assignment.residentId}` },
    { excludeUserId: ctx.userId },
  );
  return serialize(result.updated);
}

/** Release a reserved bed. The reservation stays in history as CANCELLED. */
export async function cancelReservation(ctx: TenantContext, assignmentId: string, reason?: CancelReservationInput["reason"]) {
  requirePermission(ctx, "assignments.manage");
  const input = parseInput(cancelReservationSchema, { assignmentId, reason });
  const result = await prisma.$transaction(async (tx) => {
    const first = await loadReservation(tx, ctx, input.assignmentId);
    await lockBeds(tx, ctx.organizationId, [first.bedId]);
    const assignment = await loadReservation(tx, ctx, input.assignmentId);
    const updated = await tx.residentAssignment.update({
      where: { id: assignment.id },
      data: { status: "CANCELLED", activeBedId: null, activeResidentId: null, endReason: input.reason ?? "Reservation cancelled" },
    });
    await tx.bed.update({ where: { id: assignment.bedId }, data: { status: "AVAILABLE" } });
    await refreshRoomStatus(tx, assignment.roomId);
    const pastStays = await tx.residentAssignment.count({
      where: { residentId: assignment.residentId, status: { in: ["COMPLETED", "TRANSFERRED"] } },
    });
    if (pastStays > 0 && assignment.resident.status !== "SUSPENDED") {
      await tx.resident.update({ where: { id: assignment.residentId }, data: { status: "CHECKED_OUT" } });
    }
    await audit(
      actorOf(ctx),
      { action: "assignment.reservation_cancelled", entityType: "ResidentAssignment", entityId: assignment.id, before: { status: "RESERVED" }, after: { status: "CANCELLED", reason: input.reason ?? null } },
      tx,
    );
    return { assignment, updated };
  });
  await notifyResident(ctx.organizationId, result.assignment.residentId, {
    type: "ROOM_ASSIGNED",
    title: "Your reservation was cancelled",
    body: `${result.assignment.hostel.name} · ${placementLabel(result.assignment)}${input.reason ? ` — ${input.reason}` : ""}`,
    link: "/portal",
  });
  return serialize(result.updated);
}

// ─── Transfer ───────────────────────────────────────────────────────────────

/** Move a resident to another bed (same room, another room, or another hostel). */
export async function transfer(ctx: TenantContext, raw: TransferInput) {
  requirePermission(ctx, "assignments.manage");
  const input = parseInput(transferSchema, raw);
  const transferDate = dateOnly(input.transferDate);
  assertNotFuture(ctx, transferDate, "transferDate", "The transfer date can't be in the future.");

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockResident(tx, ctx.organizationId, input.residentId);
      const current = await tx.residentAssignment.findFirst({
        where: { activeResidentId: input.residentId, ...accessWhere(ctx) },
        include: {
          resident: { select: { id: true, firstName: true, lastName: true } },
          hostel: { select: { id: true, name: true, rentalMode: true } },
          room: { select: { id: true, roomNumber: true } },
          bed: { select: { id: true, bedNumber: true } },
        },
      });
      if (!current) throw new BusinessRuleError("This resident has no active stay to transfer.");
      if (current.status !== "ACTIVE") throw new BusinessRuleError("Check the resident in (or cancel the reservation) before transferring.");
      if (current.bedId === input.toBedId) throw new BusinessRuleError("The resident is already in this bed.");
      if (transferDate < current.checkInDate) {
        throw new ValidationError("The transfer date must be on or after the current check-in date.", {
          transferDate: [`Must be on or after ${formatDate(current.checkInDate)}`],
        });
      }

      await lockBeds(tx, ctx.organizationId, [current.bedId, input.toBedId]);
      const target = await loadTargetBed(tx, ctx, input.toBedId);
      const fromLabel = placementLabel(current);
      const toLabel = placementLabel({ roomNumber: target.room.roomNumber, bedNumber: target.bedNumber });
      const crossHostel = target.hostelId !== current.hostelId;

      // End the current stay first so the unique active keys are free.
      const ended = await tx.residentAssignment.update({
        where: { id: current.id },
        data: {
          status: "TRANSFERRED",
          checkOutDate: transferDate,
          activeBedId: null,
          activeResidentId: null,
          endReason: `Transferred to ${crossHostel ? `${target.hostel.name} · ` : ""}${toLabel}`,
        },
      });
      await tx.bed.update({ where: { id: current.bedId }, data: { status: "AVAILABLE" } });
      await assertRoomHasSpace(tx, target.room);

      const next = await tx.residentAssignment.create({
        data: {
          organizationId: ctx.organizationId,
          residentId: current.residentId,
          hostelId: target.hostelId,
          roomId: target.roomId,
          bedId: target.id,
          status: "ACTIVE",
          checkInDate: transferDate,
          monthlyRent: input.monthlyRent,
          securityDeposit: current.securityDeposit,
          activeBedId: target.id,
          activeResidentId: current.residentId,
          previousAssignmentId: current.id,
          notes: input.notes ?? null,
          createdById: ctx.userId,
          // The lease follows the tenant to the new unit/bed.
          leaseEndDate: current.leaseEndDate,
          noticePeriodDays: current.noticePeriodDays,
          advanceRent: current.advanceRent,
          rentIncrementPercent: current.rentIncrementPercent,
          incrementIntervalMonths: current.incrementIntervalMonths,
          nextIncrementDate: current.nextIncrementDate,
          leaseTerms: current.leaseTerms,
        },
      });
      await tx.bed.update({ where: { id: target.id }, data: { status: "OCCUPIED" } });
      await tx.resident.update({ where: { id: current.residentId }, data: { hostelId: target.hostelId } });
      await refreshRoomStatus(tx, current.roomId);
      if (target.roomId !== current.roomId) await refreshRoomStatus(tx, target.roomId);

      await audit(
        actorOf(ctx),
        {
          action: "assignment.transferred",
          entityType: "ResidentAssignment",
          entityId: next.id,
          before: { assignmentId: ended.id, hostel: current.hostel.name, bed: fromLabel, monthlyRent: current.monthlyRent },
          after: { assignmentId: next.id, hostel: target.hostel.name, bed: toLabel, monthlyRent: next.monthlyRent },
          metadata: { residentId: current.residentId, transferDate },
        },
        tx,
      );
      return { current, next, target, fromLabel, toLabel };
    });
  } catch (error) {
    throw mapAssignmentConflict(error);
  }

  const name = fullName(result.current.resident);
  const destination = `${result.target.hostel.name} · ${result.toLabel}`;
  await notifyResident(ctx.organizationId, result.current.residentId, {
    type: "ROOM_TRANSFER",
    title: "Your room has changed",
    body: `You've been moved from ${result.fromLabel} to ${destination}.`,
    link: "/portal",
  });
  const hostels = new Set([result.current.hostelId, result.target.hostelId]);
  for (const hostelId of hostels) {
    await notifyMembers(
      ctx.organizationId,
      "residents.view",
      hostelId,
      { type: "ROOM_TRANSFER", title: `${name} transferred`, body: `${result.fromLabel} → ${destination}`, link: `/residents/${result.current.residentId}` },
      { excludeUserId: ctx.userId },
    );
  }
  return serialize(result.next);
}

// ─── Check-out ──────────────────────────────────────────────────────────────

export async function checkOut(ctx: TenantContext, raw: CheckOutInput) {
  requirePermission(ctx, "assignments.manage");
  const input = parseInput(checkOutSchema, raw);
  const checkOutDate = dateOnly(input.checkOutDate);
  assertNotFuture(ctx, checkOutDate, "checkOutDate", "Check-out can't be in the future. Mark the resident “On notice” instead.");
  const canInvoice = can(ctx, "invoices.manage");
  const canRefund = can(ctx, "payments.manage");
  if (input.finalCharges.length > 0 && !canInvoice) {
    throw new ForbiddenError("You need permission to create invoices to bill final charges.");
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockResident(tx, ctx.organizationId, input.residentId);
    const assignment = await tx.residentAssignment.findFirst({
      where: { activeResidentId: input.residentId, ...accessWhere(ctx) },
      include: {
        resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
        hostel: { select: { id: true, name: true, rentalMode: true } },
        room: { select: { id: true, roomNumber: true } },
        bed: { select: { id: true, bedNumber: true } },
      },
    });
    if (!assignment) throw new BusinessRuleError("This resident has no active stay to check out.");
    if (assignment.status === "RESERVED") throw new BusinessRuleError("This is a reservation. Cancel it instead of checking out.");
    await lockBeds(tx, ctx.organizationId, [assignment.bedId]);

    if (checkOutDate < assignment.checkInDate) {
      throw new ValidationError("Check-out must be on or after the check-in date.", {
        checkOutDate: [`Must be on or after ${formatDate(assignment.checkInDate)}`],
      });
    }
    const deposit = toNumber(assignment.securityDeposit);
    if (round2(input.depositDeduction + input.depositRefund) > deposit) {
      const message = `Deduction and refund together can't exceed the deposit of ${formatMoney(deposit, ctx.organization.currency)}.`;
      throw new ValidationError(message, { depositRefund: [message] });
    }

    const label = placementLabel(assignment);
    const finalChargesTotal = round2(input.finalCharges.reduce((s, c) => s + c.amount, 0));
    let invoice: Awaited<ReturnType<typeof createInvoiceTx>> | null = null;
    if (input.finalCharges.length > 0) {
      invoice = await createInvoiceTx(
        tx,
        ctx,
        invoiceSchema.parse({
          residentId: assignment.residentId,
          assignmentId: assignment.id,
          issueDate: checkOutDate,
          items: input.finalCharges.map((c) => ({ type: c.type, description: c.description, quantity: 1, unitPrice: c.amount })),
          notes: `Final settlement at check-out from ${label}`,
        }),
      );
    }

    let refund: Awaited<ReturnType<typeof recordRefundTx>> | null = null;
    if (input.depositRefund > 0 && canRefund) {
      refund = await recordRefundTx(tx, ctx, {
        residentId: assignment.residentId,
        amount: input.depositRefund,
        method: input.refundMethod,
        paymentDate: checkOutDate,
        notes: `Security deposit refund — ${label}`,
      });
    }

    const balance = await getResidentBalance(ctx.organizationId, assignment.residentId, tx);
    const updated = await tx.residentAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "COMPLETED",
        checkOutDate,
        finalCharges: input.finalCharges.length > 0 ? finalChargesTotal : null,
        depositDeduction: input.depositDeduction,
        depositRefund: input.depositRefund,
        meterReading: input.meterReading ?? null,
        endReason: input.endReason ?? null,
        notes: input.notes ? [assignment.notes, input.notes].filter(Boolean).join("\n\n") : assignment.notes,
        activeBedId: null,
        activeResidentId: null,
      },
    });
    await tx.bed.update({ where: { id: assignment.bedId }, data: { status: "AVAILABLE" } });
    await refreshRoomStatus(tx, assignment.roomId);
    await tx.resident.update({ where: { id: assignment.residentId }, data: { status: "CHECKED_OUT", actualLeavingDate: checkOutDate } });

    if (input.clearanceFileId) {
      await attachAssignmentDocument(tx, ctx, assignment.residentId, input.clearanceFileId, "CLEARANCE", `Clearance — ${label} (${formatDate(checkOutDate)})`);
    }

    await audit(
      actorOf(ctx),
      {
        action: "assignment.checked_out",
        entityType: "ResidentAssignment",
        entityId: assignment.id,
        before: { status: assignment.status, securityDeposit: assignment.securityDeposit },
        after: {
          status: updated.status,
          checkOutDate,
          finalCharges: updated.finalCharges,
          depositDeduction: updated.depositDeduction,
          depositRefund: updated.depositRefund,
          meterReading: updated.meterReading,
          endReason: updated.endReason,
        },
        metadata: {
          residentId: assignment.residentId,
          bed: label,
          balanceAtCheckOut: balance,
          invoiceId: invoice?.id ?? null,
          refundPaymentId: refund?.id ?? null,
          refundRecordedWithoutPayment: input.depositRefund > 0 && !refund,
        },
      },
      tx,
    );
    return { assignment, updated, invoice, refund, balance, label };
  });

  const name = fullName(result.assignment.resident);
  await notifyResident(ctx.organizationId, result.assignment.residentId, {
    type: "CHECK_OUT",
    title: "You've been checked out",
    body:
      result.balance.balance > 0
        ? `Outstanding balance: ${formatMoney(result.balance.balance, ctx.organization.currency)}. Thank you for staying with ${result.assignment.hostel.name}.`
        : `Thank you for staying with ${result.assignment.hostel.name}.`,
    link: "/portal",
  });
  if (result.invoice && result.invoice.status !== "DRAFT") {
    await notifyResident(ctx.organizationId, result.assignment.residentId, {
      type: "INVOICE_CREATED",
      title: `Final invoice ${result.invoice.invoiceNumber}`,
      body: `Amount due: ${formatMoney(toNumber(result.invoice.total), ctx.organization.currency)} by ${formatDate(result.invoice.dueDate)}`,
      link: `/portal/invoices/${result.invoice.id}`,
    });
  }
  await notifyMembers(
    ctx.organizationId,
    "residents.view",
    result.assignment.hostelId,
    { type: "CHECK_OUT", title: `${name} checked out`, body: `${result.assignment.hostel.name} · ${result.label}`, link: `/residents/${result.assignment.residentId}` },
    { excludeUserId: ctx.userId },
  );
  return serialize({
    assignment: result.updated,
    invoiceId: result.invoice?.id ?? null,
    refundId: result.refund?.id ?? null,
    balance: result.balance,
  });
}

// ─── Leases ─────────────────────────────────────────────────────────────────

/** Audit action that holds a future-dated rent change; the daily job applies it. */
export const SCHEDULED_RENT_CHANGE_ACTION = "lease.rent_change_scheduled";

/**
 * Renew (extend) a lease: new end date, optionally new terms and a new rent.
 * A rent change effective today or earlier is applied immediately; a future
 * one is recorded and applied by the daily job on its effective date.
 */
export async function renewLease(ctx: TenantContext, raw: RenewLeaseInput) {
  requirePermission(ctx, "assignments.manage");
  const input = parseInput(renewLeaseSchema, raw);
  const now = today(ctx);
  const leaseEndDate = dateOnly(input.leaseEndDate);
  const effective = input.rentEffectiveDate ? dateOnly(input.rentEffectiveDate) : now;

  const current = await prisma.residentAssignment.findFirst({
    where: { id: input.assignmentId, ...accessWhere(ctx) },
    include: {
      resident: { select: { id: true, firstName: true, lastName: true } },
      hostel: { select: { id: true, name: true, rentalMode: true } },
      room: { select: { roomNumber: true } },
      bed: { select: { bedNumber: true } },
    },
  });
  if (!current) throw new NotFoundError("Lease");
  if (current.status !== "ACTIVE") throw new BusinessRuleError("Only an active lease can be renewed.");
  if (leaseEndDate <= current.checkInDate || leaseEndDate < now) {
    throw new ValidationError("The new lease end must be in the future.", { leaseEndDate: ["Pick a date after today"] });
  }
  if (input.newMonthlyRent && effective < current.checkInDate) {
    throw new ValidationError("The new rent can't start before the move-in date.", {
      rentEffectiveDate: [`Must be on or after ${formatDate(current.checkInDate)}`],
    });
  }

  const newRent = input.newMonthlyRent ?? null;
  const applyNow = newRent !== null && effective <= now;
  const scheduleLater = newRent !== null && effective > now;

  const pct =
    input.rentIncrementPercent !== undefined && input.rentIncrementPercent !== null
      ? input.rentIncrementPercent
      : current.rentIncrementPercent !== null
        ? toNumber(current.rentIncrementPercent)
        : null;
  const interval = input.incrementIntervalMonths ?? current.incrementIntervalMonths ?? DEFAULT_INCREMENT_INTERVAL_MONTHS;
  // A new rent restarts the increment cycle from its effective date.
  const nextIncrementDate =
    pct && pct > 0
      ? newRent !== null
        ? addMonthsUtc(effective, interval)
        : (current.nextIncrementDate ?? addMonthsUtc(now, interval))
      : null;

  const before = {
    leaseEndDate: current.leaseEndDate,
    monthlyRent: current.monthlyRent,
    noticePeriodDays: current.noticePeriodDays,
    rentIncrementPercent: current.rentIncrementPercent,
    incrementIntervalMonths: current.incrementIntervalMonths,
    nextIncrementDate: current.nextIncrementDate,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.residentAssignment.update({
      where: { id: current.id },
      data: {
        leaseEndDate,
        ...(applyNow ? { monthlyRent: newRent } : {}),
        ...(input.noticePeriodDays !== undefined && input.noticePeriodDays !== null ? { noticePeriodDays: input.noticePeriodDays } : {}),
        ...(input.leaseTerms !== undefined ? { leaseTerms: input.leaseTerms ?? null } : {}),
        rentIncrementPercent: pct && pct > 0 ? round2(pct) : null,
        incrementIntervalMonths: pct && pct > 0 ? interval : current.incrementIntervalMonths,
        nextIncrementDate,
      },
    });
    const after = {
      leaseEndDate: row.leaseEndDate,
      monthlyRent: row.monthlyRent,
      noticePeriodDays: row.noticePeriodDays,
      rentIncrementPercent: row.rentIncrementPercent,
      incrementIntervalMonths: row.incrementIntervalMonths,
      nextIncrementDate: row.nextIncrementDate,
    };
    await audit(
      actorOf(ctx),
      {
        action: "lease.renewed",
        entityType: "ResidentAssignment",
        entityId: current.id,
        before,
        after,
        metadata: {
          residentId: current.residentId,
          newMonthlyRent: newRent,
          rentEffectiveDate: newRent !== null ? effective.toISOString().slice(0, 10) : null,
          rentApplied: applyNow,
        },
      },
      tx,
    );
    if (scheduleLater) {
      await audit(
        actorOf(ctx),
        {
          action: SCHEDULED_RENT_CHANGE_ACTION,
          entityType: "ResidentAssignment",
          entityId: current.id,
          metadata: { newMonthlyRent: newRent, effectiveDate: effective.toISOString().slice(0, 10) },
        },
        tx,
      );
    }
    return row;
  });

  const label = placementLabel(current);
  const money = (n: number) => formatMoney(n, ctx.organization.currency);
  await notifyResident(ctx.organizationId, current.residentId, {
    type: "SYSTEM",
    title: "Your lease has been renewed",
    body:
      `${current.hostel.name} · ${label}: now runs until ${formatDate(leaseEndDate)}.` +
      (newRent !== null ? ` New rent ${money(newRent)} from ${formatDate(effective)}.` : ""),
    link: "/portal",
  });
  return serialize(updated);
}

// ─── History ────────────────────────────────────────────────────────────────

export type AssignmentListFilters = {
  q?: string;
  status?: AssignmentStatus;
  hostelId?: string | null;
  /** Stays overlapping [from, to] (YYYY-MM-DD). */
  from?: string;
  to?: string;
  /** Active leases ending within the next 30 days. */
  expiring?: boolean;
  page?: number;
  pageSize?: number;
};

function validDate(v: string | undefined) {
  if (!v) return null;
  const d = dateOnly(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function assignmentListWhere(ctx: TenantContext, filters: AssignmentListFilters): Prisma.ResidentAssignmentWhereInput {
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  const terms = (filters.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const now = today(ctx);
  return {
    ...scopedWhere(ctx, filters.hostelId),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.expiring
      ? {
          status: "ACTIVE" as const,
          leaseEndDate: { gte: now, lte: new Date(now.getTime() + LEASE_EXPIRING_DAYS * 86400_000) },
        }
      : {}),
    ...(to ? { checkInDate: { lte: to } } : {}),
    ...(from ? { OR: [{ checkOutDate: null }, { checkOutDate: { gte: from } }] } : {}),
    ...(terms.length
      ? {
          AND: terms.map((t) => ({
            OR: [
              { resident: { firstName: { contains: t, mode: "insensitive" as const } } },
              { resident: { lastName: { contains: t, mode: "insensitive" as const } } },
              { resident: { residentCode: { contains: t, mode: "insensitive" as const } } },
              { room: { roomNumber: { contains: t, mode: "insensitive" as const } } },
            ],
          })),
        }
      : {}),
  };
}

const assignmentListInclude = {
  resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true } },
  hostel: { select: { id: true, name: true, rentalMode: true } },
  room: { select: { id: true, roomNumber: true } },
  bed: { select: { id: true, bedNumber: true } },
} satisfies Prisma.ResidentAssignmentInclude;

export async function listAssignments(ctx: TenantContext, filters: AssignmentListFilters = {}) {
  requirePermission(ctx, "residents.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where = assignmentListWhere(ctx, filters);
  const [rows, total] = await Promise.all([
    prisma.residentAssignment.findMany({
      where,
      skip,
      take,
      orderBy: [{ checkInDate: "desc" }, { createdAt: "desc" }],
      include: assignmentListInclude,
    }),
    prisma.residentAssignment.count({ where }),
  ]);
  return serialize(toPaginated(rows, total, page, pageSize));
}

export async function exportAssignments(ctx: TenantContext, filters: AssignmentListFilters = {}) {
  requirePermission(ctx, "residents.view");
  const rows = await prisma.residentAssignment.findMany({
    where: assignmentListWhere(ctx, filters),
    orderBy: [{ checkInDate: "desc" }, { createdAt: "desc" }],
    take: EXPORT_ROW_LIMIT,
    include: assignmentListInclude,
  });
  return serialize(rows);
}

/** Headline numbers for the stays screen (current hostel scope). */
export async function getAssignmentStats(ctx: TenantContext) {
  requirePermission(ctx, "residents.view");
  const now = today(ctx);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const scope = scopedWhere(ctx);
  const [active, reserved, checkIns, checkOuts, expiringSoon] = await Promise.all([
    prisma.residentAssignment.count({ where: { ...scope, status: "ACTIVE" } }),
    prisma.residentAssignment.count({ where: { ...scope, status: "RESERVED" } }),
    prisma.residentAssignment.count({ where: { ...scope, previousAssignmentId: null, status: { in: ["ACTIVE", "TRANSFERRED", "COMPLETED"] }, checkInDate: { gte: monthStart } } }),
    prisma.residentAssignment.count({ where: { ...scope, status: "COMPLETED", checkOutDate: { gte: monthStart } } }),
    prisma.residentAssignment.count({
      where: { ...scope, status: "ACTIVE", leaseEndDate: { gte: now, lte: new Date(now.getTime() + LEASE_EXPIRING_DAYS * 86400_000) } },
    }),
  ]);
  return { active, reserved, checkInsThisMonth: checkIns, checkOutsThisMonth: checkOuts, expiringSoon };
}
