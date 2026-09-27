import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { BedsTable } from "@/components/hostels/beds-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { listBeds } from "@/services/hostel/structure-service";
import { getOccupancy } from "@/services/hostel/occupancy";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { bedStatusLabels, optionsFrom } from "@/config/labels";
import { BED_STATUSES } from "@/lib/validation/property";

export const metadata = { title: "Beds" };

export default async function BedsPage({ searchParams }: PageProps<"/hostels/beds">) {
  const ctx = await requireTenantPage("rooms.view");
  const params = await searchParams;
  const [data, occupancy] = await Promise.all([
    listBeds(ctx, {
      q: sp(params, "q"),
      status: spEnum(params, "status", BED_STATUSES),
      page: spNumber(params, "page", 1),
      pageSize: spNumber(params, "pageSize", 20),
    }),
    getOccupancy(ctx),
  ]);
  const o = occupancy.overall;

  return (
    <>
      <PageHeader
        title="Beds"
        description="Individual beds, their status and current residents."
        breadcrumbs={[{ label: "Hostels", href: "/hostels" }, { label: "Beds" }]}
        actions={
          <Button asChild variant="outline">
            <Link href="/hostels/map">
              <LayoutGrid />
              Visual map
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total beds" value={o.totalBeds} />
        <StatCard label="Occupied" value={o.occupiedBeds} tone="info" />
        <StatCard label="Available" value={o.availableBeds} tone="success" />
        <StatCard label="Reserved" value={o.reservedBeds} />
        <StatCard label="Maintenance" value={o.maintenanceBeds} tone="warning" />
      </div>
      <BedsTable data={data} filters={[{ key: "status", label: "Status", options: optionsFrom(bedStatusLabels) }]} />
    </>
  );
}
