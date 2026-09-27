import Link from "next/link";
import { BedDouble, BellRing, LogIn, LogOut, Plus, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ExportMenu } from "@/components/data-table/export-menu";
import { ResidentsTable } from "@/components/residents/residents-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getResidentStatusCounts, listResidents } from "@/services/resident/resident-service";
import { parseResidentFilters } from "@/services/resident/filters";
import { residentStatusLabels } from "@/config/labels";
import { RESIDENT_STATUSES } from "@/lib/validation/resident";

export const metadata = { title: "Residents" };

export default async function ResidentsPage({ searchParams }: PageProps<"/residents">) {
  const ctx = await requireTenantPage("residents.view");
  const params = await searchParams;
  const filters = parseResidentFilters(params);
  const [data, counts, hostels] = await Promise.all([listResidents(ctx, filters), getResidentStatusCounts(ctx), listHostelOptions(ctx)]);
  const showHostel = !ctx.activeHostelId && hostels.length > 1;
  const canManage = can(ctx, "residents.manage");
  const canAssign = can(ctx, "assignments.manage");
  const filtered = !!(filters.q || filters.status || filters.assigned || filters.hostelId);

  return (
    <>
      <PageHeader
        title="Residents"
        description="Everyone living in, reserved for, or previously staying at your hostels."
        actions={
          <>
            {canAssign ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/residents/check-out">
                    <LogOut />
                    Check out
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/residents/check-in">
                    <LogIn />
                    Check in
                  </Link>
                </Button>
              </>
            ) : null}
            {canManage ? (
              <Button asChild>
                <Link href="/residents/new">
                  <Plus />
                  Add resident
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active" value={counts.active} icon={UserCheck} tone="success" href="/residents?status=ACTIVE" />
        <StatCard label="On notice" value={counts.notice} icon={BellRing} tone="warning" href="/residents?status=NOTICE" />
        <StatCard label="Awaiting a bed" value={counts.awaitingBed} icon={BedDouble} tone="info" href="/residents?assigned=no" hint="Active residents without a bed" />
        <StatCard label="Checked out" value={counts.checkedOut} icon={LogOut} href="/residents?status=CHECKED_OUT" />
      </div>

      <ResidentsTable
        data={data}
        showHostel={showHostel}
        toolbar={<ExportMenu endpoint="/api/residents/export" />}
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              ...RESIDENT_STATUSES.map((s) => ({ value: s, label: residentStatusLabels[s] })),
              { value: "ALL", label: "Everyone (incl. archived)" },
            ],
          },
          {
            key: "assigned",
            label: "Bed",
            options: [
              { value: "yes", label: "Has a bed" },
              { value: "no", label: "No bed" },
            ],
          },
          ...(showHostel ? [{ key: "hostelId", label: "Hostel", options: hostels.map((h) => ({ value: h.id, label: h.name })) }] : []),
        ]}
        empty={
          <EmptyState
            icon={Users}
            title={filtered ? "No residents match your filters" : "No residents yet"}
            description={filtered ? "Try a different search or clear the filters." : "Add your first resident, then check them in to a bed."}
            action={
              !filtered && canManage ? (
                <Button asChild>
                  <Link href="/residents/new">
                    <Plus />
                    Add resident
                  </Link>
                </Button>
              ) : null
            }
          />
        }
      />
    </>
  );
}
