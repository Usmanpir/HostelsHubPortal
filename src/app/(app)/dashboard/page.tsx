import { ShieldAlert } from "lucide-react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { HostelOccupancyList } from "@/components/dashboard/hostel-occupancy-list";
import { KpiGrid, type Kpi } from "@/components/dashboard/kpi-grid";
import { OccupancyHero } from "@/components/dashboard/occupancy-hero";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ReportChartCard } from "@/components/reports/report-chart";
import { requireTenantPage } from "@/lib/tenant/server";
import { can, type TenantContext } from "@/lib/tenant/context";
import type { Permission } from "@/lib/permissions/catalog";
import { sp } from "@/lib/page-helpers";
import { getDashboardSummary, type DashboardSummary } from "@/services/dashboard/dashboard-service";
import type { ReportChart } from "@/services/reports/types";

export const metadata = { title: "Dashboard" };

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

function buildKpis(ctx: TenantContext, s: DashboardSummary): { operational: Kpi[]; financial: Kpi[] } {
  const link = (perm: Permission, href: string) => (can(ctx, perm) ? href : undefined);
  const o = s.kpis.occupancy;
  const operational: Kpi[] = [
    { key: "hostels", label: "Hostels", value: s.kpis.hostels, format: "number", icon: "hostels", href: link("hostels.view", "/hostels") },
    { key: "rooms", label: "Rooms", value: s.kpis.rooms, format: "number", icon: "rooms", href: link("rooms.view", "/hostels/rooms") },
    { key: "beds", label: "Total beds", value: o.totalBeds, format: "number", icon: "beds", href: link("rooms.view", "/hostels/beds") },
    { key: "occupied", label: "Occupied beds", value: o.occupiedBeds, format: "number", icon: "occupied", tone: "info", href: link("rooms.view", "/hostels/map") },
    {
      key: "available",
      label: "Available beds",
      value: o.availableBeds,
      format: "number",
      icon: "available",
      tone: "success",
      href: link("reports.view", "/reports/vacancy"),
      hint: o.reservedBeds ? `${o.reservedBeds} reserved` : undefined,
    },
    {
      key: "maintenance",
      label: "Under maintenance",
      value: o.maintenanceBeds,
      format: "number",
      icon: "maintenance",
      tone: o.maintenanceBeds ? "warning" : "default",
      href: link("maintenance.view", "/operations/maintenance"),
    },
    { key: "residents", label: "Active residents", value: s.kpis.activeResidents, format: "number", icon: "residents", href: link("residents.view", "/residents"), hint: "Including residents on notice" },
    { key: "staff", label: "Active staff", value: s.kpis.activeStaff, format: "number", icon: "staff", href: link("staff.view", "/staff") },
  ];
  const financial: Kpi[] = [];
  const period = "same days last month";
  if (s.finance) {
    financial.push(
      {
        key: "revenue",
        label: "Revenue billed (this month)",
        value: s.finance.billed,
        format: "money",
        icon: "revenue",
        href: link("reports.financial", "/reports/revenue"),
        delta: { pct: change(s.finance.billed, s.finance.previous.billed), goodWhenUp: true, label: period },
      },
      {
        key: "collected",
        label: "Collected (this month)",
        value: s.finance.collected,
        format: "money",
        icon: "collected",
        tone: "success",
        href: link("reports.financial", "/reports/rent-collection"),
        delta: { pct: change(s.finance.collected, s.finance.previous.collected), goodWhenUp: true, label: period },
      },
    );
  }
  if (s.outstanding) {
    financial.push({
      key: "outstanding",
      label: "Outstanding payments",
      value: s.outstanding.total,
      format: "money",
      icon: "outstanding",
      tone: s.outstanding.overdue > 0 ? "danger" : s.outstanding.total > 0 ? "warning" : "default",
      href: can(ctx, "reports.financial") ? "/reports/outstanding" : link("invoices.view", "/finance/invoices"),
      hint: `${s.outstanding.invoices} open invoice${s.outstanding.invoices === 1 ? "" : "s"}`,
    });
  }
  if (s.finance) {
    financial.push({
      key: "expenses",
      label: "Expenses (this month)",
      value: s.finance.expenses,
      format: "money",
      icon: "expenses",
      href: link("reports.financial", "/reports/expenses"),
      delta: { pct: change(s.finance.expenses, s.finance.previous.expenses), goodWhenUp: false, label: period },
    });
  }
  return { operational, financial };
}

function buildCharts(s: DashboardSummary): ReportChart[] {
  const charts: ReportChart[] = [
    {
      id: "occupancy-trend",
      title: "Occupancy trend",
      description: "Occupied beds vs total beds at each month end",
      kind: "line",
      xKey: "month",
      xFormat: "month",
      format: "number",
      span: s.charts.revenueTrend ? "half" : "full",
      series: [
        { key: "occupied", label: "Occupied beds" },
        { key: "beds", label: "Total beds" },
      ],
      data: s.charts.occupancyTrend.map((t) => ({ month: t.month, occupied: t.occupied, beds: t.beds })),
    },
  ];
  if (s.charts.revenueTrend) {
    charts.push({
      id: "revenue-trend",
      title: "Revenue trend",
      description: "Billed vs cash collected, last 12 months",
      kind: "column",
      xKey: "month",
      xFormat: "month",
      format: "money",
      span: "half",
      series: [
        { key: "billed", label: "Billed" },
        { key: "collected", label: "Collected" },
      ],
      data: s.charts.revenueTrend,
    });
  }
  if (s.charts.collectionThisMonth) {
    charts.push({
      id: "collection",
      title: "Payment collection",
      description: "Net cash collected per day this month",
      kind: "column",
      xKey: "day",
      xFormat: "day",
      format: "money",
      span: "half",
      series: [{ key: "collected", label: "Collected" }],
      data: s.charts.collectionThisMonth,
    });
  }
  if (s.charts.expensesByCategory) {
    charts.push({
      id: "expenses",
      title: "Expenses by category",
      description: "Last 3 months",
      kind: "bar",
      xKey: "category",
      format: "money",
      span: "half",
      series: [{ key: "amount", label: "Expenses" }],
      data: s.charts.expensesByCategory,
    });
  }
  if (s.charts.hostelComparison) {
    const revenue = s.charts.hostelComparison.every((h) => h.revenue !== null);
    charts.push({
      id: "compare-occupancy",
      title: "Hostel comparison · occupancy",
      kind: "bar",
      xKey: "hostel",
      format: "percent",
      span: revenue ? "half" : "full",
      series: [{ key: "occupancy", label: "Occupancy" }],
      data: s.charts.hostelComparison.map((h) => ({ hostel: h.hostel, occupancy: h.occupancy })),
    });
    if (revenue) {
      charts.push({
        id: "compare-revenue",
        title: "Hostel comparison · revenue",
        description: "Billed this month",
        kind: "bar",
        xKey: "hostel",
        format: "money",
        span: "half",
        series: [{ key: "revenue", label: "Revenue billed" }],
        data: s.charts.hostelComparison.map((h) => ({ hostel: h.hostel, revenue: h.revenue ?? 0 })),
      });
    }
  }
  return charts;
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireTenantPage("dashboard.view");
  const params = await searchParams;
  const summary = await getDashboardSummary(ctx);
  const tz = ctx.organization.timezone || "UTC";
  const firstName = ctx.userName.split(/\s+/)[0] || ctx.userName;
  const dateLine = new Intl.DateTimeFormat(ctx.organization.locale || "en", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(
    new Date(),
  );
  const scopeLabel = summary.scope.hostelName ?? (ctx.allHostels ? "All hostels" : "Your hostels");

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
        {!summary.isEmpty ? <QuickActions permissions={ctx.permissions} /> : null}
      </div>

      {summary.isEmpty ? (
        <DashboardEmpty setup={summary.setup} permissions={ctx.permissions} />
      ) : (
        <DashboardBody ctx={ctx} summary={summary} />
      )}
    </div>
  );
}

function DashboardBody({ ctx, summary }: { ctx: TenantContext; summary: DashboardSummary }) {
  const { operational, financial } = buildKpis(ctx, summary);
  const charts = buildCharts(summary);
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-3">
        <OccupancyHero stats={summary.kpis.occupancy} href={can(ctx, "reports.view") ? "/reports/occupancy" : undefined} />
        <KpiGrid items={operational} className="lg:col-span-2" />
      </div>

      {financial.length ? <KpiGrid items={financial} className={financial.length < 4 ? "sm:grid-cols-3" : undefined} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {charts.map((c) => (
          <ReportChartCard key={c.id} chart={c} className={c.span === "full" ? "lg:col-span-2" : undefined} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <HostelOccupancyList hostels={summary.hostels} linkHostels={can(ctx, "hostels.view")} />
        <ActivityFeed items={summary.activity} className="lg:col-span-2" />
      </div>
    </>
  );
}
