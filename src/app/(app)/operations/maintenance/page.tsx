import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Hammer, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ExportMenu } from "@/components/data-table/export-menu";
import { MaintenanceTable } from "@/components/operations/maintenance-table";
import { MaintenanceBoard } from "@/components/operations/maintenance-board";
import { ViewToggle } from "@/components/operations/view-toggle";
import { FilterBar } from "@/components/operations/filter-bar";
import { requireTenantPage, homePathFor } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { listMaintenance, listMaintenanceBoard, getMaintenanceSummary } from "@/services/operations/maintenance-service";
import { maintenanceCategoryLabels, maintenanceStatusLabels, optionsFrom, priorityLabels } from "@/config/labels";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_STATUSES, PRIORITIES } from "@/lib/validation/operations";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage({ searchParams }: PageProps<"/operations/maintenance">) {
  const ctx = await requireTenantPage();
  if (!can(ctx, "maintenance.view") && !can(ctx, "maintenance.work")) redirect(homePathFor(ctx, "maintenance.view"));
  const params = await searchParams;
  const board = sp(params, "view") === "board";
  const canManage = can(ctx, "maintenance.manage");
  const viewAll = can(ctx, "maintenance.view");
  const showHostel = !ctx.activeHostelId && ctx.accessibleHostelIds.length > 1;

  const filters = {
    q: sp(params, "q"),
    priority: spEnum(params, "priority", PRIORITIES),
    category: spEnum(params, "category", MAINTENANCE_CATEGORIES),
  };
  const [summary, list, columns] = await Promise.all([
    getMaintenanceSummary(ctx),
    board
      ? null
      : listMaintenance(ctx, {
          ...filters,
          status: spEnum(params, "status", MAINTENANCE_STATUSES),
          sort: spEnum(params, "sort", ["createdAt", "priority", "status", "requestNumber"] as const),
          dir: spEnum(params, "dir", ["asc", "desc"] as const),
          page: spNumber(params, "page", 1),
          pageSize: spNumber(params, "pageSize", 20),
        }),
    board ? listMaintenanceBoard(ctx, filters) : null,
  ]);

  const newButton = canManage ? (
    <Button asChild>
      <Link href="/operations/maintenance/new">
        <Plus />
        New request
      </Link>
    </Button>
  ) : null;

  const priorityFilter = { key: "priority", label: "Priority", options: optionsFrom(priorityLabels) };
  const categoryFilter = { key: "category", label: "Category", options: optionsFrom(maintenanceCategoryLabels) };

  return (
    <>
      <PageHeader
        title="Maintenance"
        description={viewAll ? "Repair and upkeep requests across your hostels." : "Maintenance jobs assigned to you."}
        breadcrumbs={[{ label: "Operations" }, { label: "Maintenance" }]}
        actions={newButton}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={summary.byStatus.OPEN} icon={Wrench} tone="warning" hint={`${summary.open} not yet completed`} />
        <StatCard label="In progress" value={summary.byStatus.ASSIGNED + summary.byStatus.IN_PROGRESS} icon={Hammer} tone="info" hint={`${summary.byStatus.ASSIGNED} assigned, ${summary.byStatus.IN_PROGRESS} being worked on`} />
        <StatCard label="Urgent" value={summary.urgent} icon={AlertTriangle} tone={summary.urgent > 0 ? "danger" : "default"} hint="Open urgent-priority requests" />
        <StatCard label="Completed" value={summary.byStatus.COMPLETED} icon={CheckCircle2} tone="success" hint={`${summary.byStatus.REJECTED} rejected`} />
      </div>

      {board && columns ? (
        <>
          <FilterBar
            filters={[priorityFilter, categoryFilter]}
            searchPlaceholder="Search number, title, room or resident"
            trailing={
              <>
                <ViewToggle />
                <ExportMenu endpoint="/api/maintenance/export" />
              </>
            }
          />
          <MaintenanceBoard columns={columns} showHostel={showHostel} />
        </>
      ) : list ? (
        <MaintenanceTable
          data={list}
          showHostel={showHostel}
          filters={[{ key: "status", label: "Status", options: optionsFrom(maintenanceStatusLabels) }, priorityFilter, categoryFilter]}
          toolbar={<ViewToggle />}
          emptyAction={newButton}
          filtered={!!(filters.q || filters.priority || filters.category || sp(params, "status"))}
        />
      ) : null}
    </>
  );
}
