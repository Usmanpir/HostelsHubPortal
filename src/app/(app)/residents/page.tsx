import Link from "next/link";
import { BedDouble, BellRing, LogIn, LogOut, Plus, Upload, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ExportMenu } from "@/components/data-table/export-menu";
import { ResidentsTable } from "@/components/residents/residents-table";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { can } from "@/lib/tenant/context";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getResidentStatusCounts, listResidents } from "@/services/resident/resident-service";
import { parseResidentFilters } from "@/services/resident/filters";
import { residentStatusLabels } from "@/config/labels";
import { RESIDENT_STATUSES } from "@/lib/validation/resident";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: termsFor(ctx?.organization.businessType).residents };
}

export default async function ResidentsPage({ searchParams }: PageProps<"/residents">) {
  const ctx = await requireTenantPage("residents.view");
  const params = await searchParams;
  const filters = parseResidentFilters(params);
  const [data, counts, hostels] = await Promise.all([listResidents(ctx, filters), getResidentStatusCounts(ctx), listHostelOptions(ctx)]);
  const showHostel = !ctx.activeHostelId && hostels.length > 1;
  const canManage = can(ctx, "residents.manage");
  const canAssign = can(ctx, "assignments.manage");
  const filtered = !!(filters.q || filters.status || filters.assigned || filters.hostelId);
  const t = termsFor(ctx.organization.businessType);
  const hostelOrg = ctx.organization.businessType === "HOSTELS";
  const resident = t.resident.toLowerCase();
  const residents = t.residents.toLowerCase();

  return (
    <>
      <PageHeader
        title={t.residents}
        description={
          hostelOrg
            ? "Everyone living in, reserved for, or previously staying at your hostels."
            : `Every ${resident} — current, upcoming and past — across your ${t.properties.toLowerCase()}.`
        }
        actions={
          <>
            {canAssign ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/residents/check-out">
                    <LogOut />
                    {t.checkOut}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/residents/check-in">
                    <LogIn />
                    {t.checkIn}
                  </Link>
                </Button>
              </>
            ) : null}
            {canManage ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/residents/import">
                    <Upload />
                    Import
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/residents/new">
                    <Plus />
                    Add {resident}
                  </Link>
                </Button>
              </>
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
            label: hostelOrg ? "Bed" : t.unit,
            options: hostelOrg
              ? [
                  { value: "yes", label: "Has a bed" },
                  { value: "no", label: "No bed" },
                ]
              : [
                  { value: "yes", label: `Has a ${t.unit.toLowerCase()}` },
                  { value: "no", label: `No ${t.unit.toLowerCase()}` },
                ],
          },
          ...(showHostel ? [{ key: "hostelId", label: t.property, options: hostels.map((h) => ({ value: h.id, label: h.name })) }] : []),
        ]}
        empty={
          <EmptyState
            icon={Users}
            title={filtered ? `No ${residents} match your filters` : `No ${residents} yet`}
            description={
              filtered
                ? "Try a different search or clear the filters."
                : hostelOrg
                  ? "Add your first resident, then check them in to a bed."
                  : `Add your first ${resident}, then move them in to a ${t.unit.toLowerCase()}.`
            }
            action={
              !filtered && canManage ? (
                <Button asChild>
                  <Link href="/residents/new">
                    <Plus />
                    Add {resident}
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
