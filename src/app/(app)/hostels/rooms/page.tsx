import { DoorOpen, Plus, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RoomsTable } from "@/components/hostels/rooms-table";
import { BulkRoomsDialog, RoomDialog } from "@/components/hostels/room-dialog";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { listFloors, listRooms } from "@/services/hostel/structure-service";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { optionsFrom, roomStatusLabels, roomTypeLabels } from "@/config/labels";
import { ROOM_STATUSES, ROOM_TYPES } from "@/lib/validation/property";

export const metadata = { title: "Rooms" };

export default async function RoomsPage({ searchParams }: PageProps<"/hostels/rooms">) {
  const ctx = await requireTenantPage("rooms.view");
  const params = await searchParams;
  const floorId = sp(params, "floorId");
  const [data, floors] = await Promise.all([
    listRooms(ctx, {
      q: sp(params, "q"),
      floorId,
      status: spEnum(params, "status", ROOM_STATUSES),
      roomType: spEnum(params, "roomType", ROOM_TYPES),
      page: spNumber(params, "page", 1),
      pageSize: spNumber(params, "pageSize", 20),
    }),
    listFloors(ctx),
  ]);
  const floorOptions = floors.map((f) => ({ id: f.id, name: f.name, hostelId: f.hostelId, hostelName: f.hostel.name }));
  const canManage = can(ctx, "rooms.manage") && floors.length > 0;

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Every room with live bed occupancy."
        breadcrumbs={[{ label: "Hostels", href: "/hostels" }, { label: "Rooms" }]}
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
                    Add room
                  </Button>
                }
              />
            </>
          ) : null
        }
      />
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
            title="No rooms found"
            description={floors.length ? "Add rooms to a floor — beds are created automatically." : "Add a floor to a hostel before creating rooms."}
          />
        }
      />
    </>
  );
}
