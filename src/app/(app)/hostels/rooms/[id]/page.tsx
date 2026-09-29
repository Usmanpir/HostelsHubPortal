import { Archive, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { RoomDialog } from "@/components/hostels/room-dialog";
import { RoomBeds } from "@/components/hostels/room-beds";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { getRoom, listFloors } from "@/services/hostel/structure-service";
import { formatMoney } from "@/lib/format";
import { roomStatusLabels, roomStatusTones, roomTypeLabels } from "@/config/labels";
import { termsFor } from "@/lib/terms";
import { archiveRoomAction } from "../../actions";

export default async function RoomDetailPage({ params }: PageProps<"/hostels/rooms/[id]">) {
  const ctx = await requireTenantPage("rooms.view");
  const { id } = await params;
  const room = await loadOr404(getRoom(ctx, id));
  const canManage = can(ctx, "rooms.manage");
  const floors = canManage ? await listFloors(ctx, room.hostelId) : [];
  const occupied = room.beds.filter((b) => b.status === "OCCUPIED").length;
  const t = termsFor(ctx.organization.businessType);
  const whole = room.hostel.rentalMode === "WHOLE_UNIT";
  const unit = whole ? "Unit" : t.unit;
  const money = (n: number | null) => (n !== null ? formatMoney(n, ctx.organization.currency) : `${t.property} default`);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {unit} {room.roomNumber}
            <EnumBadge value={room.status} labels={roomStatusLabels} tones={roomStatusTones} />
          </span>
        }
        description={`${room.hostel.name} · ${room.floor.name} · ${roomTypeLabels[room.roomType]}`}
        breadcrumbs={[
          { label: t.properties, href: "/hostels" },
          { label: room.hostel.name, href: `/hostels/${room.hostel.id}` },
          { label: whole ? "Units" : t.units, href: "/hostels/rooms" },
          { label: room.roomNumber },
        ]}
        actions={
          canManage ? (
            <>
              <RoomDialog
                floors={floors.map((f) => ({ id: f.id, name: f.name, hostelId: f.hostelId, hostelName: f.hostel.name, rentalMode: f.hostel.rentalMode }))}
                room={room}
                trigger={
                  <Button variant="outline">
                    <Pencil />
                    Edit {unit.toLowerCase()}
                  </Button>
                }
              />
              <ConfirmAction
                trigger={
                  <Button variant="ghost" className="text-destructive" disabled={occupied > 0}>
                    <Archive />
                    Archive
                  </Button>
                }
                title={`Archive ${unit.toLowerCase()} ${room.roomNumber}?`}
                description={
                  whole
                    ? "The unit is removed from availability. History is kept."
                    : `The ${t.unit.toLowerCase()} and its beds are removed from availability. History is kept.`
                }
                confirmLabel="Archive"
                destructive
                action={archiveRoomAction.bind(null, room.id)}
              />
            </>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RoomBeds
            room={{
              id: room.id,
              roomNumber: room.roomNumber,
              capacity: room.capacity,
              rent: room.rent,
              hostelName: room.hostel.name,
              beds: room.beds,
              wholeUnit: whole,
            }}
          />
        </div>
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
          <h2 className="font-semibold">Details</h2>
          {whole ? (
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Monthly rent</dt>
                <dd className="tabular">{money(room.rent)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd>{roomTypeLabels[room.roomType]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Bedrooms / baths</dt>
                <dd className="tabular">
                  {room.bedrooms ?? "—"} / {room.bathrooms ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Area</dt>
                <dd className="tabular">{room.areaSqft ? `${room.areaSqft.toLocaleString()} sq ft` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Furnished</dt>
                <dd>{room.furnished ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>{occupied ? "Leased" : "Vacant"}</dd>
              </div>
            </dl>
          ) : (
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Capacity</dt>
                <dd className="tabular">{room.capacity} beds</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Occupied</dt>
                <dd className="tabular">
                  {occupied} / {room.beds.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Rent per bed</dt>
                <dd className="tabular">{money(room.rent)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd>{roomTypeLabels[room.roomType]}</dd>
              </div>
            </dl>
          )}
          {room.amenities.length ? (
            <div className="flex flex-wrap gap-1.5">
              {room.amenities.map((a) => (
                <Badge key={a} variant="secondary">
                  {a}
                </Badge>
              ))}
            </div>
          ) : null}
          {room.description ? <p className="text-muted-foreground">{room.description}</p> : null}
        </section>
      </div>
    </>
  );
}
