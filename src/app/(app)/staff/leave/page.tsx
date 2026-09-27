import Link from "next/link";
import { CalendarPlus, Plane, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import type { FilterDef } from "@/components/data-table/data-table";
import { LeaveDialog } from "@/components/staff/leave-dialog";
import { LeaveTable } from "@/components/staff/leave-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { todayInTimeZone } from "@/lib/format";
import { approvalStatusLabels, leaveTypeLabels, optionsFrom } from "@/config/labels";
import { listLeaves, listLeaveStaffOptions } from "@/services/staff/leave-service";
import { leaveFiltersFromParams } from "@/services/staff/params";

export const metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: PageProps<"/staff/leave">) {
  const ctx = await requireTenantPage("leave.view");
  const params = await searchParams;
  const filters = leaveFiltersFromParams(params);
  const [data, staffOptions] = await Promise.all([listLeaves(ctx, filters), listLeaveStaffOptions(ctx)]);
  const today = todayInTimeZone(ctx.organization.timezone);
  const filteredStaff = filters.staffId ? data.items[0]?.staff : null;
  const filtered = !!(filters.q || filters.status || filters.type || filters.staffId);

  const filterDefs: FilterDef[] = [
    { key: "status", label: "Status", options: optionsFrom(approvalStatusLabels) },
    { key: "type", label: "Type", options: optionsFrom(leaveTypeLabels) },
  ];

  const newButton =
    staffOptions.length > 0 ? (
      <LeaveDialog
        staff={staffOptions}
        defaultStaffId={filters.staffId}
        today={today}
        trigger={
          <Button>
            <CalendarPlus />
            New request
          </Button>
        }
      />
    ) : null;

  return (
    <>
      <PageHeader
        title="Leave"
        description={
          data.pendingCount > 0
            ? `${data.pendingCount} request${data.pendingCount === 1 ? "" : "s"} waiting for review.`
            : "Leave requests and approvals for your staff."
        }
        breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: "Leave" }]}
        actions={newButton}
      />
      {filters.staffId ? (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Showing leave for{" "}
            <span className="font-medium text-foreground">
              {filteredStaff ? `${filteredStaff.firstName} ${filteredStaff.lastName}` : "one staff member"}
            </span>
          </span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/staff/leave">
              <X />
              Show everyone
            </Link>
          </Button>
        </div>
      ) : null}
      <LeaveTable
        data={data}
        filters={filterDefs}
        empty={
          <EmptyState
            icon={Plane}
            title={filtered ? "No leave matches your filters" : "No leave requests yet"}
            description={filtered ? "Try a different status or type." : "Record casual, sick or annual leave for your staff and approve it here."}
            action={filtered ? null : newButton}
          />
        }
      />
    </>
  );
}
