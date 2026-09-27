import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PayrollStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { actorOf, assertHostelAccess, requirePermission, type TenantContext } from "@/lib/tenant/context";
import {
  EMPLOYED_STATUSES,
  payrollComponentsSchema,
  payrollGenerateSchema,
  payrollPaySchema,
  periodSchema,
  type PayrollComponentsInput,
  type PayrollGenerateInput,
  type PayrollPayInput,
} from "@/lib/validation/staff";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { dateOnly, todayInTimeZone } from "@/lib/format";
import { EXPORT_ROW_LIMIT } from "@/lib/export";
import { staffAccessWhere, staffScopeWhere } from "./scope";
import { calculateNetSalary } from "./payroll-calc";

export type PayrollListFilters = {
  year: number;
  month: number;
  status?: PayrollStatus;
  q?: string;
  hostelId?: string | null;
  page?: number;
  pageSize?: number;
};

function payrollWhere(ctx: TenantContext, filters: PayrollListFilters): Prisma.PayrollWhereInput {
  return {
    organizationId: ctx.organizationId,
    year: filters.year,
    month: filters.month,
    ...(filters.status ? { status: filters.status } : {}),
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
  };
}

const payrollInclude = {
  staff: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      archivedAt: true,
      hostels: { where: { isPrimary: true }, select: { hostel: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.PayrollInclude;

function currentPeriod(ctx: TenantContext) {
  const today = todayInTimeZone(ctx.organization.timezone);
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

/** Employed staff in scope, joined by the end of the period, without a record for it yet. */
function eligibleStaffWhere(ctx: TenantContext, year: number, month: number, hostelId?: string | null): Prisma.StaffWhereInput {
  return {
    ...staffScopeWhere(ctx, hostelId),
    archivedAt: null,
    status: { in: [...EMPLOYED_STATUSES] },
    joiningDate: { lte: new Date(Date.UTC(year, month, 0)) },
    payrolls: { none: { year, month } },
  };
}

export async function listPayroll(ctx: TenantContext, filters: PayrollListFilters) {
  requirePermission(ctx, "payroll.view");
  const period = parseInput(periodSchema, { year: filters.year, month: filters.month });
  if (filters.hostelId) assertHostelAccess(ctx, filters.hostelId);
  const { skip, take, page, pageSize } = paginate(filters);
  const where = payrollWhere(ctx, { ...filters, ...period });
  const totalsWhere = payrollWhere(ctx, { year: period.year, month: period.month, hostelId: filters.hostelId });

  const [rows, total, groups, eligible] = await Promise.all([
    prisma.payroll.findMany({
      where,
      skip,
      take,
      orderBy: [{ status: "asc" }, { staff: { firstName: "asc" } }],
      include: payrollInclude,
    }),
    prisma.payroll.count({ where }),
    prisma.payroll.groupBy({ by: ["status"], where: totalsWhere, _sum: { netSalary: true }, _count: { _all: true } }),
    prisma.staff.count({ where: eligibleStaffWhere(ctx, period.year, period.month, filters.hostelId) }),
  ]);

  const sum = (s: PayrollStatus) => toNumber(groups.find((g) => g.status === s)?._sum.netSalary ?? null);
  const count = (s: PayrollStatus) => groups.find((g) => g.status === s)?._count._all ?? 0;
  const totals = {
    paid: round2(sum("PAID")),
    pending: round2(sum("PENDING")),
    totalNet: round2(sum("PAID") + sum("PENDING")),
    paidCount: count("PAID"),
    pendingCount: count("PENDING"),
    cancelledCount: count("CANCELLED"),
  };
  return serialize({ ...toPaginated(rows, total, page, pageSize), totals, eligibleToGenerate: eligible, ...period });
}

export async function listPayrollForExport(ctx: TenantContext, filters: PayrollListFilters) {
  requirePermission(ctx, "payroll.view");
  const period = parseInput(periodSchema, { year: filters.year, month: filters.month });
  if (filters.hostelId) assertHostelAccess(ctx, filters.hostelId);
  const rows = await prisma.payroll.findMany({
    where: payrollWhere(ctx, { ...filters, ...period }),
    orderBy: [{ staff: { firstName: "asc" } }, { staff: { lastName: "asc" } }],
    take: EXPORT_ROW_LIMIT,
    include: payrollInclude,
  });
  return serialize(rows);
}

export async function getPayslip(ctx: TenantContext, id: string) {
  requirePermission(ctx, "payroll.view");
  const payroll = await prisma.payroll.findFirst({
    where: { id, organizationId: ctx.organizationId, staff: staffAccessWhere(ctx) },
    include: {
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          designation: true,
          department: true,
          employmentType: true,
          joiningDate: true,
          phone: true,
          hostels: {
            orderBy: { isPrimary: "desc" },
            select: { isPrimary: true, hostel: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!payroll) throw new NotFoundError("Salary record");
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { name: true, brandName: true, address: true, city: true, country: true, phone: true, email: true, logoFileId: true },
  });
  return serialize({ ...payroll, organization });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function generatePayroll(ctx: TenantContext, raw: PayrollGenerateInput) {
  requirePermission(ctx, "payroll.manage");
  const input = parseInput(payrollGenerateSchema, raw);
  if (input.hostelId) assertHostelAccess(ctx, input.hostelId);
  const now = currentPeriod(ctx);
  if (input.year * 12 + input.month > now.year * 12 + now.month) {
    throw new BusinessRuleError("Salaries can't be generated for a future month.");
  }

  const eligible = await prisma.staff.findMany({
    where: eligibleStaffWhere(ctx, input.year, input.month, input.hostelId),
    select: { id: true, salary: true },
  });
  const payable = eligible.filter((s) => toNumber(s.salary) > 0);
  const skippedNoSalary = eligible.length - payable.length;

  const created = await prisma.$transaction(async (tx) => {
    const result = await tx.payroll.createMany({
      data: payable.map((s) => {
        const baseSalary = toNumber(s.salary);
        return {
          organizationId: ctx.organizationId,
          staffId: s.id,
          year: input.year,
          month: input.month,
          baseSalary,
          netSalary: calculateNetSalary({ baseSalary }),
        };
      }),
      // (staffId, year, month) is unique: records created concurrently are skipped.
      skipDuplicates: true,
    });
    await audit(
      actorOf(ctx),
      {
        action: "payroll.generated",
        entityType: "Payroll",
        entityId: null,
        metadata: { year: input.year, month: input.month, hostelId: input.hostelId ?? null, created: result.count, skippedNoSalary },
      },
      tx,
    );
    return result.count;
  });
  return { created, skippedNoSalary };
}

async function loadPayroll(ctx: TenantContext, id: string) {
  const payroll = await prisma.payroll.findFirst({
    where: { id, organizationId: ctx.organizationId, staff: staffAccessWhere(ctx) },
  });
  if (!payroll) throw new NotFoundError("Salary record");
  return payroll;
}

function assertPending(status: PayrollStatus) {
  if (status === "PAID") throw new BusinessRuleError("This salary has already been paid and can't be changed.");
  if (status === "CANCELLED") throw new BusinessRuleError("This salary record has been cancelled.");
}

export async function updatePayroll(ctx: TenantContext, id: string, raw: PayrollComponentsInput) {
  requirePermission(ctx, "payroll.manage");
  const input = parseInput(payrollComponentsSchema, raw);
  const before = await loadPayroll(ctx, id);
  assertPending(before.status);
  const netSalary = calculateNetSalary(input);
  if (netSalary < 0) {
    throw new ValidationError("Net salary can't be negative. Reduce deductions or advances.", {
      deductions: ["Net salary can't be negative"],
    });
  }
  return prisma.$transaction(async (tx) => {
    // Guard against a concurrent payment between the read and the write.
    const result = await tx.payroll.updateMany({
      where: { id, status: "PENDING" },
      data: {
        baseSalary: input.baseSalary,
        allowances: input.allowances,
        bonus: input.bonus,
        deductions: input.deductions,
        advances: input.advances,
        netSalary,
        notes: input.notes ?? null,
      },
    });
    if (result.count !== 1) throw new ConflictError("This salary record was changed by someone else. Reload and try again.");
    const after = await tx.payroll.findUniqueOrThrow({ where: { id } });
    await audit(actorOf(ctx), { action: "payroll.updated", entityType: "Payroll", entityId: id, before, after }, tx);
    return serialize(after);
  });
}

export async function payPayroll(ctx: TenantContext, id: string, raw: PayrollPayInput) {
  requirePermission(ctx, "payroll.manage");
  const input = parseInput(payrollPaySchema, raw);
  const before = await loadPayroll(ctx, id);
  assertPending(before.status);
  if (toNumber(before.netSalary) < 0) throw new BusinessRuleError("Net salary is negative. Edit the record before paying.");
  const paymentDate = dateOnly(input.paymentDate);
  const today = dateOnly(todayInTimeZone(ctx.organization.timezone));
  if (paymentDate.getTime() > today.getTime()) {
    throw new ValidationError("Payment date can't be in the future.", { paymentDate: ["Payment date can't be in the future"] });
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.payroll.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "PAID",
        paymentDate,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? before.notes,
      },
    });
    if (result.count !== 1) throw new ConflictError("This salary was already paid or changed. Reload and try again.");
    const after = await tx.payroll.findUniqueOrThrow({ where: { id } });
    await audit(
      actorOf(ctx),
      {
        action: "payroll.paid",
        entityType: "Payroll",
        entityId: id,
        before,
        after,
        metadata: { label: "Salary payment", staffId: before.staffId, amount: after.netSalary },
      },
      tx,
    );
    return serialize(after);
  });
}

export async function cancelPayroll(ctx: TenantContext, id: string) {
  requirePermission(ctx, "payroll.manage");
  const before = await loadPayroll(ctx, id);
  assertPending(before.status);
  await prisma.$transaction(async (tx) => {
    const result = await tx.payroll.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (result.count !== 1) throw new ConflictError("This salary was already paid or changed. Reload and try again.");
    await audit(
      actorOf(ctx),
      { action: "payroll.cancelled", entityType: "Payroll", entityId: id, before: { status: before.status }, after: { status: "CANCELLED" } },
      tx,
    );
  });
}

/** Undo a cancellation (the unique staff/month slot is kept by the cancelled row). */
export async function reopenPayroll(ctx: TenantContext, id: string) {
  requirePermission(ctx, "payroll.manage");
  const before = await loadPayroll(ctx, id);
  if (before.status !== "CANCELLED") throw new BusinessRuleError("Only cancelled salary records can be reopened.");
  await prisma.$transaction(async (tx) => {
    const result = await tx.payroll.updateMany({ where: { id, status: "CANCELLED" }, data: { status: "PENDING" } });
    if (result.count !== 1) throw new ConflictError("This salary record was changed by someone else. Reload and try again.");
    await audit(
      actorOf(ctx),
      { action: "payroll.reopened", entityType: "Payroll", entityId: id, before: { status: before.status }, after: { status: "PENDING" } },
      tx,
    );
  });
}
