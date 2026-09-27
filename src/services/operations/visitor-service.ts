import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { accessWhere, actorOf, requirePermission, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import {
  visitorCheckInSchema,
  visitorFiltersSchema,
  type VisitorCheckInInput,
  type VisitorFilters,
} from "@/lib/validation/operations";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { serialize } from "@/lib/serialize";
import { todayInTimeZone } from "@/lib/format";
import { notifyResident } from "@/lib/notifications/notify";
import { assertResidentInHostel, assertWritableHostel, endOfDayInZone, startOfDayInZone } from "./shared";

/** Mirrors EXPORT_ROW_LIMIT in src/lib/export.ts (not imported to keep exceljs out of action bundles). */
const EXPORT_LIMIT = 10_000;
const ENTITY = "Visitor";

const include = {
  hostel: { select: { id: true, name: true, code: true } },
  resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
  recordedBy: { select: { id: true, name: true } },
} satisfies Prisma.VisitorInclude;

function todayRange(ctx: TenantContext) {
  const tz = ctx.organization.timezone;
  const today = todayInTimeZone(tz);
  return { start: startOfDayInZone(today, tz), end: endOfDayInZone(today, tz) };
}

function buildWhere(ctx: TenantContext, filters: ReturnType<typeof visitorFiltersSchema.parse>): Prisma.VisitorWhereInput {
  requirePermission(ctx, "visitors.view");
  const tz = ctx.organization.timezone;
  return {
    AND: [
      scopedWhere(ctx, filters.hostelId),
      filters.from ? { checkInAt: { gte: startOfDayInZone(filters.from, tz) } } : {},
      filters.to ? { checkInAt: { lt: endOfDayInZone(filters.to, tz) } } : {},
      filters.state === "inside" ? { checkOutAt: null } : filters.state === "left" ? { checkOutAt: { not: null } } : {},
      filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { phone: { contains: filters.q } },
              { idNumber: { contains: filters.q, mode: "insensitive" } },
              { purpose: { contains: filters.q, mode: "insensitive" } },
              { resident: { firstName: { contains: filters.q, mode: "insensitive" } } },
              { resident: { lastName: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
}

export async function listVisitors(ctx: TenantContext, raw: VisitorFilters = {}) {
  const filters = parseInput(visitorFiltersSchema, raw);
  const where = buildWhere(ctx, filters);
  const { skip, take, page, pageSize } = paginate(filters);
  const [rows, total] = await Promise.all([
    prisma.visitor.findMany({ where, skip, take, orderBy: { checkInAt: "desc" }, include }),
    prisma.visitor.count({ where }),
  ]);
  return serialize(toPaginated(rows, total, page, pageSize));
}

export async function exportVisitors(ctx: TenantContext, raw: VisitorFilters = {}) {
  const filters = parseInput(visitorFiltersSchema, { ...raw, page: 1, pageSize: 100 });
  return prisma.visitor.findMany({ where: buildWhere(ctx, filters), orderBy: { checkInAt: "desc" }, take: EXPORT_LIMIT, include });
}

/** Visitors who have not checked out yet (any day), newest first. */
export async function listVisitorsInside(ctx: TenantContext, hostelId?: string | null) {
  requirePermission(ctx, "visitors.view");
  const rows = await prisma.visitor.findMany({
    where: { ...scopedWhere(ctx, hostelId), checkOutAt: null },
    orderBy: { checkInAt: "desc" },
    take: 200,
    include,
  });
  return serialize(rows);
}

export async function getVisitor(ctx: TenantContext, id: string) {
  requirePermission(ctx, "visitors.view");
  const visitor = await prisma.visitor.findFirst({ where: { id, ...accessWhere(ctx) }, include });
  if (!visitor) throw new NotFoundError("Visitor");
  return serialize(visitor);
}

/** Today's numbers in the organization's time zone. */
export async function getVisitorStats(ctx: TenantContext, hostelId?: string | null) {
  requirePermission(ctx, "visitors.view");
  const scope = scopedWhere(ctx, hostelId);
  const { start, end } = todayRange(ctx);
  const [todayCount, inside, completedToday] = await Promise.all([
    prisma.visitor.count({ where: { ...scope, checkInAt: { gte: start, lt: end } } }),
    prisma.visitor.count({ where: { ...scope, checkOutAt: null } }),
    prisma.visitor.count({ where: { ...scope, checkInAt: { gte: start, lt: end }, checkOutAt: { not: null } } }),
  ]);
  return { today: todayCount, inside, completedToday };
}

export async function checkInVisitor(ctx: TenantContext, raw: VisitorCheckInInput) {
  requirePermission(ctx, "visitors.manage");
  const input = parseInput(visitorCheckInSchema, raw);
  const hostel = await assertWritableHostel(ctx, input.hostelId);
  const resident = input.residentId ? await assertResidentInHostel(ctx, input.hostelId, input.residentId) : null;

  const visitor = await prisma.$transaction(async (tx) => {
    const created = await tx.visitor.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: input.hostelId,
        residentId: resident?.id ?? null,
        name: input.name,
        phone: input.phone ?? null,
        idNumber: input.idNumber ?? null,
        purpose: input.purpose ?? null,
        notes: input.notes ?? null,
        recordedById: ctx.userId,
      },
      include,
    });
    await audit(
      actorOf(ctx),
      { action: "visitor.checked_in", entityType: ENTITY, entityId: created.id, after: { name: created.name, hostel: hostel.name, residentId: created.residentId, purpose: created.purpose } },
      tx,
    );
    return created;
  });

  if (resident) {
    await notifyResident(ctx.organizationId, resident.id, {
      type: "SYSTEM",
      title: `Visitor at reception: ${visitor.name}`,
      body: visitor.purpose ?? `${visitor.name} has checked in to see you at ${hostel.name}.`,
      link: "/portal",
    });
  }
  return serialize(visitor);
}

export async function checkOutVisitor(ctx: TenantContext, id: string) {
  requirePermission(ctx, "visitors.manage");
  const visitor = await prisma.visitor.findFirst({ where: { id, ...accessWhere(ctx) }, select: { id: true, name: true, checkOutAt: true } });
  if (!visitor) throw new NotFoundError("Visitor");
  if (visitor.checkOutAt) throw new BusinessRuleError(`${visitor.name} has already checked out.`);
  const updated = await prisma.$transaction(async (tx) => {
    // Conditional update so two receptionists tapping at once can't double check-out.
    const result = await tx.visitor.updateMany({ where: { id, checkOutAt: null }, data: { checkOutAt: new Date() } });
    if (result.count === 0) throw new BusinessRuleError(`${visitor.name} has already checked out.`);
    await audit(actorOf(ctx), { action: "visitor.checked_out", entityType: ENTITY, entityId: id, metadata: { name: visitor.name } }, tx);
    return tx.visitor.findUniqueOrThrow({ where: { id }, include });
  });
  return serialize(updated);
}
