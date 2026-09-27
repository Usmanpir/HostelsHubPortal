import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, FileText, Plus, Scale, Wallet, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { FinanceRangeFilter } from "@/components/finance/finance-range-filter";
import {
  CollectionTrendChart,
  ExpensesByCategoryChart,
  HostelRevenueChart,
  MonthlyTrendChart,
  PaymentMethodsChart,
} from "@/components/finance/finance-charts";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp } from "@/lib/page-helpers";
import { formatMoney, todayInTimeZone, toDateInput } from "@/lib/format";
import { getFinanceDashboard } from "@/services/finance/finance-dashboard-service";
import { resolveRange } from "@/services/finance/range";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Finance overview" };

export default async function FinanceOverviewPage({ searchParams }: PageProps<"/finance">) {
  const ctx = await requireTenantPage("reports.financial");
  const params = await searchParams;
  const range = resolveRange(todayInTimeZone(ctx.organization.timezone), sp(params, "range"), sp(params, "from"), sp(params, "to"));
  const [dashboard, hostels] = await Promise.all([getFinanceDashboard(ctx, { from: range.from, to: range.to }), listHostelOptions(ctx)]);
  const s = dashboard.summary;
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const fromIso = toDateInput(range.from);
  const toIso = toDateInput(range.to);
  const dateQuery = `from=${fromIso}&to=${toIso}`;
  const activeHostel = hostels.find((h) => h.id === ctx.activeHostelId);
  const scopeLabel = activeHostel ? activeHostel.name : hostels.length > 1 ? `All ${hostels.length} hostels` : (hostels[0]?.name ?? "All hostels");
  const link = (perm: Parameters<typeof can>[1], href: string) => (can(ctx, perm) ? href : undefined);

  return (
    <>
      <PageHeader
        title="Finance overview"
        description="Billing, collections and spending. Use the hostel switcher in the header to focus on one property."
        actions={
          <>
            {can(ctx, "invoices.manage") ? (
              <Button asChild variant="outline">
                <Link href="/finance/invoices/new">
                  <FileText />
                  New invoice
                </Link>
              </Button>
            ) : null}
            {can(ctx, "payments.manage") ? (
              <Button asChild>
                <Link href="/finance/payments/new">
                  <Plus />
                  Record payment
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <FinanceRangeFilter preset={range.preset} from={fromIso} to={toIso} label={range.label} scopeLabel={scopeLabel} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Revenue billed"
          value={money(s.revenueBilled)}
          hint={`${s.invoiceCount} invoice${s.invoiceCount === 1 ? "" : "s"} issued`}
          icon={FileText}
          href={link("invoices.view", `/finance/invoices?${dateQuery}`)}
        />
        <StatCard
          label="Collected"
          value={money(s.collected)}
          hint={s.refunds > 0 ? `After ${money(s.refunds)} refunds` : s.collectionRate !== null ? `${Math.round(s.collectionRate)}% of billed` : `${s.paymentCount} payments`}
          icon={ArrowDownLeft}
          tone="success"
          href={link("payments.view", `/finance/payments?${dateQuery}&status=COMPLETED`)}
        />
        <StatCard
          label="Outstanding"
          value={money(s.outstanding)}
          hint={`${s.outstandingCount} unpaid · all dates`}
          icon={Wallet}
          tone="info"
          href={link("invoices.view", "/finance/invoices?status=RECEIVABLE")}
        />
        <StatCard
          label="Overdue"
          value={money(s.overdue)}
          hint={`${s.overdueCount} past due · all dates`}
          icon={AlertTriangle}
          tone={s.overdueCount > 0 ? "danger" : "default"}
          href={link("invoices.view", "/finance/invoices?status=OVERDUE")}
        />
        <StatCard
          label="Expenses"
          value={money(s.expenses)}
          hint={`${s.expenseCount} recorded`}
          icon={WalletCards}
          tone="warning"
          href={link("expenses.view", `/finance/expenses?${dateQuery}`)}
        />
        <StatCard
          label="Net income"
          value={<span className={cn(s.netIncome < 0 && "text-danger")}>{money(s.netIncome)}</span>}
          hint="Payments received − refunds − expenses"
          icon={Scale}
          tone={s.netIncome < 0 ? "danger" : "success"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <MonthlyTrendChart data={dashboard.monthly} />
        <CollectionTrendChart trend={dashboard.trend} />
        <HostelRevenueChart data={dashboard.byHostel} />
        <ExpensesByCategoryChart data={dashboard.expensesByCategory} />
        <PaymentMethodsChart data={dashboard.paymentMethods} />
      </div>
    </>
  );
}
