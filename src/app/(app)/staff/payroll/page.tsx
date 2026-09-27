import { CircleCheck, Clock, Wallet, Receipt } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { ExportMenu } from "@/components/data-table/export-menu";
import type { FilterDef } from "@/components/data-table/data-table";
import { GeneratePayrollButton, PayrollTable } from "@/components/staff/payroll-table";
import { HostelScopeSelect, MonthNav } from "@/components/staff/period-controls";
import { monthLabel } from "@/components/staff/staff-format";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp, spNumber } from "@/lib/page-helpers";
import { formatMoney, todayInTimeZone } from "@/lib/format";
import { optionsFrom, payrollStatusLabels } from "@/config/labels";
import { monthKey } from "@/lib/validation/staff";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { listPayroll } from "@/services/staff/payroll-service";
import { payrollStatusFromParams, periodFromParams } from "@/services/staff/params";

export const metadata = { title: "Payroll" };

export default async function PayrollPage({ searchParams }: PageProps<"/staff/payroll">) {
  const ctx = await requireTenantPage("payroll.view");
  const params = await searchParams;
  const period = periodFromParams(ctx, params);
  const hostels = await listHostelOptions(ctx);
  const requested = sp(params, "hostel");
  const hostelId = requested && hostels.some((h) => h.id === requested) ? requested : null;
  const status = payrollStatusFromParams(params);
  const q = sp(params, "q");
  const data = await listPayroll(ctx, {
    ...period,
    status,
    q,
    hostelId,
    page: spNumber(params, "page", 1),
    pageSize: spNumber(params, "pageSize", 20),
  });
  const today = todayInTimeZone(ctx.organization.timezone);
  const current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const label = monthLabel(period.year, period.month);
  const canManage = can(ctx, "payroll.manage");
  const isFuture = period.year * 12 + period.month > current.year * 12 + current.month;
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const t = data.totals;
  const records = t.paidCount + t.pendingCount + t.cancelledCount;

  const generate =
    canManage && !isFuture ? (
      <GeneratePayrollButton
        year={period.year}
        month={period.month}
        hostelId={hostelId ?? ctx.activeHostelId}
        eligible={data.eligibleToGenerate}
        periodLabel={label}
        variant={records > 0 ? "outline" : "default"}
      />
    ) : null;

  const filterDefs: FilterDef[] = [{ key: "status", label: "Status", options: optionsFrom(payrollStatusLabels) }];

  return (
    <>
      <PageHeader
        title="Payroll"
        description={`Salaries for ${label}`}
        breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: "Payroll" }]}
        actions={generate}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <MonthNav year={period.year} month={period.month} current={current} />
        {!ctx.activeHostelId && hostels.length > 1 ? (
          <div className="sm:ms-auto">
            <HostelScopeSelect hostels={hostels} allowAll value={hostelId} />
          </div>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total net payroll" value={money(t.totalNet)} hint={`${t.paidCount + t.pendingCount} active records`} icon={Wallet} />
        <StatCard label="Paid" value={money(t.paid)} hint={`${t.paidCount} paid`} icon={CircleCheck} tone="success" />
        <StatCard label="Pending" value={money(t.pending)} hint={`${t.pendingCount} to pay`} icon={Clock} tone={t.pendingCount ? "warning" : "default"} />
        <StatCard
          label="Not generated"
          value={data.eligibleToGenerate}
          hint={data.eligibleToGenerate ? "staff without a record this month" : "everyone has a record"}
          icon={Receipt}
          tone={data.eligibleToGenerate ? "info" : "default"}
        />
      </div>

      <PayrollTable
        data={data}
        filters={filterDefs}
        periodLabel={label}
        today={today}
        toolbar={records > 0 ? <ExportMenu endpoint="/api/payroll/export" extraParams={{ month: monthKey(period.year, period.month) }} /> : null}
        empty={
          <EmptyState
            icon={Wallet}
            title={records > 0 ? "No salary records match your filters" : `No salaries generated for ${label}`}
            description={
              records > 0
                ? "Try a different search or status."
                : isFuture
                  ? "Salaries can be generated once the month starts."
                  : data.eligibleToGenerate > 0
                    ? `Generate salary records for ${data.eligibleToGenerate} active staff member${data.eligibleToGenerate === 1 ? "" : "s"} from their monthly salary. You can adjust allowances, bonuses and deductions before paying.`
                    : "There are no active staff with a salary in this scope."
            }
            action={records > 0 ? null : generate}
          />
        }
      />
    </>
  );
}
