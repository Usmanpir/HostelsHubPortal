import Link from "next/link";
import { Building2, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { OccupancyBar } from "@/components/hostels/occupancy-bar";
import { RoomMap } from "@/components/hostels/room-map";
import { requireTenantPage } from "@/lib/tenant/server";
import { getRoomMap } from "@/services/hostel/structure-service";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getOccupancy } from "@/services/hostel/occupancy";
import { sp } from "@/lib/page-helpers";
import { cn } from "@/lib/utils";

export const metadata = { title: "Room map" };

export default async function RoomMapPage({ searchParams }: PageProps<"/hostels/map">) {
  const ctx = await requireTenantPage("rooms.view");
  const params = await searchParams;
  const hostels = await listHostelOptions(ctx);
  const requested = sp(params, "hostel");
  const hostelId =
    (requested && hostels.some((h) => h.id === requested) ? requested : null) ?? ctx.activeHostelId ?? hostels[0]?.id ?? null;

  if (!hostelId) {
    return (
      <>
        <PageHeader title="Room map" />
        <EmptyState icon={Building2} title="No hostels yet" description="Create a hostel with floors and rooms to see the visual map." />
      </>
    );
  }

  const [floors, occupancy] = await Promise.all([getRoomMap(ctx, hostelId), getOccupancy(ctx, hostelId)]);
  const hostel = hostels.find((h) => h.id === hostelId)!;

  return (
    <>
      <PageHeader
        title="Room map"
        description="Every floor, room and bed at a glance. Click a bed to see details or check someone in."
        breadcrumbs={[{ label: "Hostels", href: "/hostels" }, { label: "Room map" }]}
      />
      {hostels.length > 1 && !ctx.activeHostelId ? (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {hostels.map((h) => (
            <Button key={h.id} asChild size="sm" variant={h.id === hostelId ? "default" : "outline"} className={cn("shrink-0")}>
              <Link href={`/hostels/map?hostel=${h.id}`}>{h.name}</Link>
            </Button>
          ))}
        </div>
      ) : null}
      <div className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <LayoutGrid className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{hostel.name}</span>
        </div>
        <OccupancyBar stats={occupancy.overall} showLegend />
      </div>
      {floors.length === 0 ? (
        <EmptyState
          title="No floors in this hostel"
          description="Add floors and rooms to build the map."
          action={
            <Button asChild>
              <Link href={`/hostels/${hostelId}`}>Set up floors</Link>
            </Button>
          }
        />
      ) : (
        <RoomMap floors={floors} hostelName={hostel.name} />
      )}
    </>
  );
}
