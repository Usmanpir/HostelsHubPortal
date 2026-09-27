import Link from "next/link";
import { BedDouble, CalendarClock, History, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ExportMenu } from "@/components/data-table/export-menu";
import { AssignmentsTable } from "@/components/residents/assignments-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getAssignmentStats, listAssignments } from "@/services/resident/assignment-service";
import { parseAssignmentFilters } from "@/services/resident/filters";
import { assignmentStatusLabels, optionsFrom } from "@/config/labels";

export const metadata = { title: "Stays" };

export default async function AssignmentsPage({ searchParams }: PageProps<"/residents/assignments">) {
  const ctx = await requireTenantPage("residents.view");
  const params = await searchParams;
  const filters = parseAssignmentFilters(params);
  const [data, stats, hostels] = await Promise.all([listAssignments(ctx, filters), getAssignmentStats(ctx), listHostelOptions(ctx, { includeArchived: true })]);
  const showHostel = !ctx.activeHostelId && hostels.length > 1;
  const filtered = !!(filters.q || filters.status || filters.from || filters.to || filters.hostelId);

  return (
    <>
      <PageHeader
        title="Stays"
        description="Complete history of check-ins, reservations, transfers and check-outs."
        breadcrumbs={[{ label: "Residents", href: "/residents" }, { label: "Stays" }]}
        actions={
          can(ctx, "assignments.manage") ? (
            <Button asChild>
              <Link href="/residents/check-in">
                <LogIn />
                Check in
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active stays" value={stats.active} icon={BedDouble} tone="success" href="/residents/assignments?status=ACTIVE" />
        <StatCard label="Reservations" value={stats.reserved} icon={CalendarClock} tone="info" href="/residents/assignments?status=RESERVED" />
        <StatCard label="Check-ins this month" value={stats.checkInsThisMonth} icon={LogIn} />
        <StatCard label="Check-outs this month" value={stats.checkOutsThisMonth} icon={LogOut} href="/residents/assignments?status=COMPLETED" />
      </div>
      <AssignmentsTable
        data={data}
        showHostel={showHostel}
        toolbar={<ExportMenu endpoint="/api/assignments/export" />}
        filters={[
          { key: "status", label: "Status", options: optionsFrom(assignmentStatusLabels) },
          ...(showHostel ? [{ key: "hostelId", label: "Hostel", options: hostels.map((h) => ({ value: h.id, label: h.name })) }] : []),
        ]}
        empty={
          <EmptyState
            icon={History}
            title={filtered ? "No stays match your filters" : "No stays yet"}
            description={filtered ? "Try a different search or date range." : "Stays appear here as residents are checked in."}
          />
        }
      />
    </>
  );
}
