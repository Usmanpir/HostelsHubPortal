import { CheckCircle2, DoorOpen, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { VisitorCheckInForm } from "@/components/operations/visitor-check-in";
import { VisitorsInside } from "@/components/operations/visitors-inside";
import { VisitorLogTable } from "@/components/operations/visitor-log-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { getVisitorStats, listVisitors, listVisitorsInside } from "@/services/operations/visitor-service";
import { listHostelOptions } from "@/services/hostel/hostel-service";

export const metadata = { title: "Visitors" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function VisitorsPage({ searchParams }: PageProps<"/operations/visitors">) {
  const ctx = await requireTenantPage("visitors.view");
  const params = await searchParams;
  const canManage = can(ctx, "visitors.manage");

  let from = sp(params, "from");
  let to = sp(params, "to");
  if (from && !DAY.test(from)) from = undefined;
  if (to && !DAY.test(to)) to = undefined;
  if (from && to && to < from) [from, to] = [to, from];
  const q = sp(params, "q");
  const state = spEnum(params, "state", ["inside", "left"] as const);

  const [stats, inside, log, hostels] = await Promise.all([
    getVisitorStats(ctx),
    listVisitorsInside(ctx),
    listVisitors(ctx, { q, from, to, state, page: spNumber(params, "page", 1), pageSize: spNumber(params, "pageSize", 20) }),
    canManage ? listHostelOptions(ctx) : Promise.resolve([]),
  ]);
  const activeHostels = hostels.filter((h) => h.status !== "ARCHIVED").map((h) => ({ id: h.id, name: h.name }));
  const defaultHostelId = ctx.activeHostelId && activeHostels.some((h) => h.id === ctx.activeHostelId) ? ctx.activeHostelId : null;
  const showHostel = !ctx.activeHostelId && ctx.accessibleHostelIds.length > 1;

  return (
    <>
      <PageHeader
        title="Visitors"
        description="Reception log — check guests in and out in seconds."
        breadcrumbs={[{ label: "Operations" }, { label: "Visitors" }]}
      />

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Today's visitors" value={stats.today} icon={Users} />
        <StatCard label="Currently inside" value={stats.inside} icon={DoorOpen} tone={stats.inside > 0 ? "info" : "default"} />
        <StatCard label="Completed visits" value={stats.completedToday} icon={CheckCircle2} tone="success" hint="Today" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {canManage ? (
          <section className="rounded-xl border bg-card p-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold">Quick check-in</h2>
            {activeHostels.length ? (
              <VisitorCheckInForm hostels={activeHostels} defaultHostelId={defaultHostelId} />
            ) : (
              <EmptyState title="No hostels available" description="You need access to an active hostel to check visitors in." className="py-8" />
            )}
          </section>
        ) : null}
        <section className={canManage ? "lg:col-span-3" : "lg:col-span-5"}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Currently inside <span className="text-muted-foreground tabular">({inside.length})</span>
            </h2>
          </div>
          <VisitorsInside visitors={inside} canManage={canManage} showHostel={showHostel} />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Visitor log</h2>
        <VisitorLogTable data={log} showHostel={showHostel} filtered={!!(q || from || to || state)} />
      </section>
    </>
  );
}
