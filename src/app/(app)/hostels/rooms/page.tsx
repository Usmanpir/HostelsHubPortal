import { DoorOpen, Plus, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { RoomsTable } from "@/components/hostels/rooms-table";
import { BulkRoomsDialog, RoomDialog } from "@/components/hostels/room-dialog";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { getRentalModeUsage } from "@/services/hostel/hostel-service";
import { can } from "@/lib/tenant/context";
import { listFloors, listRooms } from "@/services/hostel/structure-service";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { optionsFrom, roomStatusLabels, roomTypeLabels } from "@/config/labels";
import { ROOM_STATUSES, ROOM_TYPES } from "@/lib/validation/property";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: termsFor(ctx?.organization.businessType).units };
}

export default async function RoomsPage({ searchParams }: PageProps<"/hostels/rooms">) {
  const ctx = await requireTenantPage("rooms.view");
  const params = await searchParams;
  const floorId = sp(params, "floorId");
  const t = termsFor(ctx.organization.businessType);
  const [data, floors, usage] = await Promise.all([
    listRooms(ctx, {
      q: sp(params, "q"),
      floorId,
      status: spEnum(params, "status", ROOM_STATUSES),
      roomType: spEnum(params, "roomType", ROOM_TYPES),
      page: spNumber(params, "page", 1),
      pageSize: spNumber(params, "pageSize", 20),
    }),
    listFloors(ctx),
    getRentalModeUsage(ctx),
  ]);
  const floorOptions = floors.map((f) => ({
    id: f.id,
    name: f.name,
    hostelId: f.hostelId,
    hostelName: f.hostel.name,
    rentalMode: f.hostel.rentalMode,
  }));
  const onlyWhole = !usage.byBed;
  const canManage = can(ctx, "rooms.manage") && floors.length > 0;

  return (
    <>
      <PageHeader
        title={t.units}
        description={
          onlyWhole
            ? `Every ${t.unit.toLowerCase()} with its current ${t.resident.toLowerCase()} and rent.`
            : `Every ${t.unit.toLowerCase()} with live bed occupancy.`
        }
        breadcrumbs={[{ label: t.properties, href: "/hostels" }, { label: t.units }]}
        actions={
          canManage ? (
            <>
              <BulkRoomsDialog
                floors={floorOptions}
                defaultFloorId={floorId}
                trigger={
                  <Button variant="outline">
                    <Rows3 />
                    Bulk add
                  </Button>
                }
              />
              <RoomDialog
                floors={floorOptions}
                defaultFloorId={floorId}
                trigger={
                  <Button>
                    <Plus />
                    Add {t.unit.toLowerCase()}
                  </Button>
                }
              />
            </>
          ) : null
        }
      />
      <SectionTabs group="roomsAndBeds" hide={onlyWhole ? ["/hostels/beds"] : undefined} />
      <RoomsTable
        data={data}
        filters={[
          { key: "floorId", label: "Floor", options: floorOptions.map((f) => ({ value: f.id, label: new Set(floorOptions.map((x) => x.hostelId)).size > 1 ? `${f.hostelName} · ${f.name}` : f.name })) },
          { key: "status", label: "Status", options: optionsFrom(roomStatusLabels) },
          { key: "roomType", label: "Type", options: optionsFrom(roomTypeLabels) },
        ]}
        empty={
          <EmptyState
            icon={DoorOpen}
            title={`No ${t.units.toLowerCase()} found`}
            description={
              floors.length
                ? onlyWhole
                  ? `Add ${t.units.toLowerCase()} to a floor.`
                  : `Add ${t.units.toLowerCase()} to a floor — beds are created automatically.`
                : `Add a floor to a ${t.property.toLowerCase()} before creating ${t.units.toLowerCase()}.`
            }
          />
        }
      />
    </>
  );
}
