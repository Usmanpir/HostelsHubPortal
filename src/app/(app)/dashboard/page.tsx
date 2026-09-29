import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { dashboardWords, type DashboardWords } from "@/components/dashboard/dashboard-words";
import { HostelOccupancyList } from "@/components/dashboard/hostel-occupancy-list";
import { KpiGrid, type Kpi } from "@/components/dashboard/kpi-grid";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ReportChartCard } from "@/components/reports/report-chart";
import { requireTenantPage } from "@/lib/tenant/server";
import { can, type TenantContext } from "@/lib/tenant/context";
import type { Permission } from "@/lib/permissions/catalog";
import { sp } from "@/lib/page-helpers";
import { cn } from "@/lib/utils";
import { getDashboardSummary, type DashboardSummary } from "@/services/dashboard/dashboard-service";
import type { ReportChart } from "@/services/reports/types";

export const metadata = { title: "Dashboard" };

const ACTIVITY_LIMIT = 6;

function greeting(timeZone: string) {
  let hour = 12;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  } catch {
    /* invalid zone: fall back to midday */
  }
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Exactly four headline figures; financial ones replace operational ones when permitted. */
function buildKpis(ctx: TenantContext, s: DashboardSummary, w: DashboardWords): Kpi[] {
  const link = (perm: Permission, href: string) => (can(ctx, perm) ? href : undefined);
  const o = s.kpis.occupancy;
  const usable = o.totalBeds - o.maintenanceBeds - o.inactiveBeds;
  const kpis: Kpi[] = [
    {
      key: "occupancy",
      label: "Occupancy",
      value: o.occupancyRate,
      format: "percent",
      icon: "occupancy",
      tone: "info",
      href: link("reports.view", "/reports/occupancy") ?? link("rooms.view", "/hostels/map"),
      // The rate excludes beds out of service, so say so when the denominators differ.
      hint: usable === o.totalBeds ? `${o.occupiedBeds.toLocaleString()} of ${o.totalBeds.toLocaleString()} ${w.capacity} occupied` : `${o.occupiedBeds.toLocaleString()} of ${usable.toLocaleString()} usable ${w.capacity} (${o.totalBeds.toLocaleString()} total)`,
    },
    {
      key: "available",
      label: `Available ${w.capacity}`,
      value: o.availableBeds,
      format: "number",
      icon: "available",
      tone: "success",
      href: link("reports.view", "/reports/vacancy") ?? link("rooms.view", "/hostels/map"),
      hint: o.reservedBeds ? `${o.reservedBeds} reserved` : `Ready for ${w.checkInNoun}`,
    },
  ];

  if (s.finance) {
    kpis.push({
      key: "collected",
      label: "Collected this month",
      value: s.finance.collected,
      format: "money",
      icon: "collected",
      tone: "success",
      href: link("reports.financial", "/reports/rent-collection"),
      delta: { pct: change(s.finance.collected, s.finance.previous.collected), goodWhenUp: true, label: "last month" },
    });
  } else {
    kpis.push({
      key: "residents",
      label: `Active ${w.residents}`,
      value: s.kpis.activeResidents,
      format: "number",
      icon: "residents",
      href: link("residents.view", "/residents"),
      hint: `Including ${w.residents} on notice`,
    });
  }

  if (s.outstanding) {
    kpis.push({
      key: "outstanding",
      label: "Outstanding",
      value: s.outstanding.total,
      format: "money",
      icon: "outstanding",
      tone: s.outstanding.overdue > 0 ? "danger" : s.outstanding.total > 0 ? "warning" : "default",
      href: link("reports.financial", "/reports/outstanding") ?? link("invoices.view", "/finance/invoices"),
      hint: `${s.outstanding.invoices} open invoice${s.outstanding.invoices === 1 ? "" : "s"}`,
    });
  } else if (s.kpis.openMaintenance !== null) {
    kpis.push({
      key: "maintenance",
      label: "Open maintenance",
      value: s.kpis.openMaintenance,
      format: "number",
      icon: "maintenance",
      tone: s.kpis.openMaintenance ? "warning" : "default",
      href: link("maintenance.view", "/operations/maintenance"),
      hint: o.maintenanceBeds ? `${o.maintenanceBeds} ${o.maintenanceBeds === 1 ? w.capacityOne : w.capacity} out of service` : "Requests awaiting work",
    });
  } else {
    kpis.push({
      key: "staff",
      label: "Active staff",
      value: s.kpis.activeStaff,
      format: "number",
      icon: "staff",
      href: link("staff.view", "/staff"),
    });
  }
  return kpis;
}

/** One chart: revenue for financial users, occupancy for everyone else. */
function buildChart(s: DashboardSummary, w: DashboardWords): ReportChart {
  if (s.charts.revenueTrend) {
    return {
      id: "revenue-trend",
      title: "Billed vs collected",
      description: "Last 12 months",
      kind: "column",
      xKey: "month",
      xFormat: "month",
      format: "money",
      span: "full",
      series: [
        { key: "billed", label: "Billed" },
        { key: "collected", label: "Collected" },
      ],
      data: s.charts.revenueTrend,
    };
  }
  return {
    id: "occupancy-trend",
    title: "Occupancy trend",
    description: `Occupied vs total ${w.capacity} at each month end`,
    kind: "line",
    xKey: "month",
    xFormat: "month",
    format: "number",
    span: "full",
    series: [
      { key: "occupied", label: `Occupied ${w.capacity}` },
      { key: "beds", label: `Total ${w.capacity}` },
    ],
    data: s.charts.occupancyTrend.map((t) => ({ month: t.month, occupied: t.occupied, beds: t.beds })),
  };
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireTenantPage("dashboard.view");
  const params = await searchParams;
  const summary = await getDashboardSummary(ctx);
  const tz = ctx.organization.timezone || "UTC";
  const firstName = ctx.userName.split(/\s+/)[0] || ctx.userName;
  const dateLine = new Intl.DateTimeFormat(ctx.organization.locale || "en", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date());
  const w = dashboardWords(ctx.organization.businessType);
  const scopeLabel = summary.scope.hostelName ?? (ctx.allHostels ? `All ${w.properties}` : `Your ${w.properties}`);

  return (
    <div className="flex flex-col gap-6">
      {sp(params, "denied") ? (
        <div role="status" className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          You don&apos;t have access to that page.
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greeting(tz)}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateLine} · <span className="text-foreground">{scopeLabel}</span>
          </p>
        </div>
        {!summary.isEmpty ? <QuickActions permissions={ctx.permissions} terms={w.t} /> : null}
      </div>

      {summary.isEmpty ? (
        <DashboardEmpty setup={summary.setup} permissions={ctx.permissions} words={w} />
      ) : (
        <DashboardBody ctx={ctx} summary={summary} words={w} />
      )}
    </div>
  );
}

function DashboardBody({ ctx, summary, words: w }: { ctx: TenantContext; summary: DashboardSummary; words: DashboardWords }) {
  const kpis = buildKpis(ctx, summary, w);
  const chart = buildChart(summary, w);
  // The revenue chart and /finance are both gated by reports.financial.
  const analyticsHref = summary.charts.revenueTrend && can(ctx, "reports.financial") ? "/finance" : can(ctx, "reports.view") ? "/reports" : null;
  const showHostels = !ctx.activeHostelId && summary.hostels.length > 1;

  return (
    <>
      <KpiGrid items={kpis} />

      <ReportChartCard
        chart={chart}
        action={
          analyticsHref ? (
            <Link
              href={analyticsHref}
              className="inline-flex items-center gap-1 rounded-sm text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="sm:hidden">Details</span>
              <span className="hidden sm:inline">See detailed analytics</span>
              <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            </Link>
          ) : null
        }
      />

      <div className={cn("grid gap-4", showHostels && "lg:grid-cols-2")}>
        {showHostels ? <HostelOccupancyList hostels={summary.hostels} linkHostels={can(ctx, "hostels.view")} words={w} /> : null}
        <ActivityFeed items={summary.activity.slice(0, ACTIVITY_LIMIT)} viewAllHref={can(ctx, "audit.view") ? "/audit-log" : undefined} />
      </div>
    </>
  );
}
