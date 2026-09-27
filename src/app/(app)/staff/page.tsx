import Link from "next/link";
import { Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ExportMenu } from "@/components/data-table/export-menu";
import type { FilterDef } from "@/components/data-table/data-table";
import { StaffTable } from "@/components/staff/staff-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { employmentTypeLabels, optionsFrom, staffStatusLabels, staffTypeLabels } from "@/config/labels";
import { listStaff } from "@/services/staff/staff-service";
import { staffFiltersFromParams } from "@/services/staff/params";
import { listHostelOptions } from "@/services/hostel/hostel-service";

export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const ctx = await requireTenantPage("staff.view");
  const params = await searchParams;
  const filters = staffFiltersFromParams(params);
  const [data, hostels] = await Promise.all([listStaff(ctx, filters), listHostelOptions(ctx)]);
  const canManage = can(ctx, "staff.manage");
  const showSalary = can(ctx, "payroll.view");
  const filtered = !!(filters.q || filters.designation || filters.status || filters.employmentType || filters.hostelId);

  const filterDefs: FilterDef[] = [
    { key: "designation", label: "Designation", options: optionsFrom(staffTypeLabels) },
    { key: "status", label: "Status", options: [...optionsFrom(staffStatusLabels), { value: "ARCHIVED", label: "Archived" }] },
    { key: "employmentType", label: "Employment", options: optionsFrom(employmentTypeLabels) },
    ...(!ctx.activeHostelId && hostels.length > 1
      ? [{ key: "hostelId", label: "Hostel", options: hostels.map((h) => ({ value: h.id, label: h.name })) }]
      : []),
  ];

  const addButton = canManage ? (
    <Button asChild>
      <Link href="/staff/new">
        <Plus />
        Add staff
      </Link>
    </Button>
  ) : null;

  return (
    <>
      <PageHeader title="Staff" description="Everyone who works across your hostels." actions={addButton} />
      <StaffTable
        data={data}
        filters={filterDefs}
        showSalary={showSalary}
        toolbar={data.total > 0 ? <ExportMenu endpoint="/api/staff/export" /> : null}
        empty={
          <EmptyState
            icon={UsersRound}
            title={filtered ? "No staff match your filters" : "No staff yet"}
            description={
              filtered
                ? "Try a different search or clear the filters."
                : "Add wardens, cooks, cleaners and security guards to track attendance, leave and payroll."
            }
            action={filtered ? null : addButton}
          />
        }
      />
    </>
  );
}
