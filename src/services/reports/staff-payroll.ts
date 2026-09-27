import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { PayrollStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { paymentMethodLabels, payrollStatusLabels, payrollStatusTones, staffTypeLabels } from "@/config/labels";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { fillMonths, isoDate, staffScope, type ReportFilters } from "./shared";

/** Payroll periods (year, month) overlapping the range. */
function periodWhere(f: ReportFilters): Prisma.PayrollWhereInput {
  const fy = Number(f.from.slice(0, 4));
  const fm = Number(f.from.slice(5, 7));
  const ty = Number(f.to.slice(0, 4));
  const tm = Number(f.to.slice(5, 7));
  if (fy === ty) return { year: fy, month: { gte: fm, lte: tm } };
  return {
    OR: [{ year: fy, month: { gte: fm } }, ...(ty - fy > 1 ? [{ year: { gt: fy, lt: ty } }] : []), { year: ty, month: { lte: tm } }],
  };
}

function where(ctx: TenantContext, f: ReportFilters): Prisma.PayrollWhereInput {
  return {
    organizationId: ctx.organizationId,
    staff: staffScope(ctx, f),
    ...periodWhere(f),
    ...(f.status ? { status: f.status as PayrollStatus } : {}),
  };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export const staffPayrollReport: ReportImpl = {
  async summary(ctx, f) {
    const [byPeriod, staffCount] = await Promise.all([
      prisma.payroll.groupBy({
        by: ["year", "month", "status"],
        where: where(ctx, f),
        _sum: { netSalary: true, baseSalary: true, allowances: true, bonus: true, deductions: true, advances: true },
        _count: { _all: true },
      }),
      prisma.payroll.groupBy({ by: ["staffId"], where: { ...where(ctx, f), status: { not: "CANCELLED" } } }),
    ]);
    const months = new Map<string, { paid: number; pending: number }>();
    const totals = { paid: 0, pending: 0, base: 0, allowances: 0, bonus: 0, deductions: 0, advances: 0, slips: 0 };
    for (const r of byPeriod) {
      if (r.status === "CANCELLED") continue;
      const key = monthKey(r.year, r.month);
      const m = months.get(key) ?? { paid: 0, pending: 0 };
      const net = round2(toNumber(r._sum.netSalary));
      if (r.status === "PAID") m.paid = round2(m.paid + net);
      else m.pending = round2(m.pending + net);
      months.set(key, m);
      if (r.status === "PAID") totals.paid += net;
      else totals.pending += net;
      totals.base += toNumber(r._sum.baseSalary);
      totals.allowances += toNumber(r._sum.allowances);
      totals.bonus += toNumber(r._sum.bonus);
      totals.deductions += toNumber(r._sum.deductions);
      totals.advances += toNumber(r._sum.advances);
      totals.slips += r._count._all;
    }
    const net = round2(totals.paid + totals.pending);
    return {
      stats: [
        { label: "Total net payroll", value: net, format: "money", tone: "info" },
        { label: "Paid", value: round2(totals.paid), format: "money", tone: "success" },
        { label: "Pending", value: round2(totals.pending), format: "money", tone: totals.pending ? "warning" : "default" },
        { label: "Staff paid / due", value: staffCount.length, format: "number" },
        { label: "Salary slips", value: totals.slips, format: "number", hint: "Excludes cancelled" },
      ],
      charts: [
        {
          id: "monthly",
          title: "Payroll per month",
          kind: "stacked",
          xKey: "month",
          xFormat: "month",
          format: "money",
          series: [
            { key: "paid", label: "Paid" },
            { key: "pending", label: "Pending" },
          ],
          data: fillMonths(f, months, { paid: 0, pending: 0 }),
        },
      ],
      breakdowns: [
        {
          id: "components",
          title: "Salary components",
          columns: [
            { key: "name", header: "Component" },
            { key: "amount", header: "Amount", format: "money", align: "end" },
          ],
          rows: [
            { id: "base", name: "Base salary", amount: round2(totals.base) },
            { id: "allowances", name: "Allowances", amount: round2(totals.allowances) },
            { id: "bonus", name: "Bonus", amount: round2(totals.bonus) },
            { id: "deductions", name: "Less: deductions", amount: -round2(totals.deductions) },
            { id: "advances", name: "Less: advances recovered", amount: -round2(totals.advances) },
          ],
          totals: { id: "net", name: "Net payroll", amount: net },
        },
      ],
    };
  },

  async rows(ctx, f, paging) {
    const w = where(ctx, f);
    const [rows, total] = await Promise.all([
      prisma.payroll.findMany({
        where: w,
        orderBy: [{ year: "desc" }, { month: "desc" }, { staff: { firstName: "asc" } }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          year: true,
          month: true,
          baseSalary: true,
          allowances: true,
          bonus: true,
          deductions: true,
          advances: true,
          netSalary: true,
          status: true,
          paymentDate: true,
          paymentMethod: true,
          staff: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } },
        },
      }),
      prisma.payroll.count({ where: w }),
    ]);
    return {
      title: "Salary slips",
      total,
      columns: [
        { key: "period", header: "Period" },
        { key: "name", header: "Staff member", hrefKey: "href", subKey: "designation" },
        { key: "base", header: "Base", format: "money", align: "end", hideOnMobile: true },
        { key: "allowances", header: "Allowances", format: "money", align: "end", defaultHidden: true },
        { key: "bonus", header: "Bonus", format: "money", align: "end", defaultHidden: true },
        { key: "deductions", header: "Deductions", format: "money", align: "end", hideOnMobile: true },
        { key: "advances", header: "Advances", format: "money", align: "end", defaultHidden: true },
        { key: "net", header: "Net salary", format: "money", align: "end" },
        { key: "status", header: "Status", format: "badge", labels: payrollStatusLabels, tones: payrollStatusTones },
        { key: "paidOn", header: "Paid on", format: "date", hideOnMobile: true },
        { key: "method", header: "Method", format: "badge", labels: paymentMethodLabels, defaultHidden: true },
      ],
      rows: rows.map((p) => ({
        id: p.id,
        period: new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(p.year, p.month - 1, 1))),
        name: `${p.staff.firstName} ${p.staff.lastName}`.trim(),
        designation: `${p.staff.employeeCode} · ${staffTypeLabels[p.staff.designation]}`,
        href: `/staff/${p.staff.id}`,
        base: round2(toNumber(p.baseSalary)),
        allowances: round2(toNumber(p.allowances)),
        bonus: round2(toNumber(p.bonus)),
        deductions: round2(toNumber(p.deductions)),
        advances: round2(toNumber(p.advances)),
        net: round2(toNumber(p.netSalary)),
        status: p.status,
        paidOn: isoDate(p.paymentDate),
        method: p.paymentMethod,
      })),
    };
  },
};
