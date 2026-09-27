import Link from "next/link";
import { Archive, ArchiveRestore, BedDouble, DoorOpen, Layers, LayoutGrid, Mail, MapPin, Pencil, Phone, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { OccupancyBar } from "@/components/hostels/occupancy-bar";
import { FloorDialog } from "@/components/hostels/floor-dialog";
import { RoomDialog } from "@/components/hostels/room-dialog";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { getHostel } from "@/services/hostel/hostel-service";
import { formatMoney } from "@/lib/format";
import { hostelGenderLabels, hostelStatusLabels, hostelStatusTones, hostelTypeLabels, staffTypeLabels } from "@/config/labels";
import { archiveHostelAction, restoreHostelAction } from "../actions";

export default async function HostelDetailPage({ params }: PageProps<"/hostels/[id]">) {
  const ctx = await requireTenantPage("hostels.view");
  const { id } = await params;
  const hostel = await loadOr404(getHostel(ctx, id));
  const canManageHostel = can(ctx, "hostels.manage");
  const canManageRooms = can(ctx, "rooms.manage");
  const money = (n: number | null) => (n === null ? "—" : formatMoney(n, ctx.organization.currency));
  const archived = hostel.status === "ARCHIVED";
  const floorOptions = hostel.floors.map((f) => ({ id: f.id, name: f.name, hostelId: hostel.id, hostelName: hostel.name }));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {hostel.name}
            <EnumBadge value={hostel.status} labels={hostelStatusLabels} tones={hostelStatusTones} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{hostel.code}</span>
            <span>{hostelTypeLabels[hostel.type]}</span>
            <span>{hostelGenderLabels[hostel.gender]} residents</span>
            {hostel.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {hostel.city}
              </span>
            ) : null}
          </span>
        }
        breadcrumbs={[{ label: "Hostels", href: "/hostels" }, { label: hostel.name }]}
        actions={
          <>
            {can(ctx, "rooms.view") ? (
              <Button asChild variant="outline">
                <Link href={`/hostels/map?hostel=${hostel.id}`}>
                  <LayoutGrid />
                  Room map
                </Link>
              </Button>
            ) : null}
            {canManageHostel && !archived ? (
              <Button asChild variant="outline">
                <Link href={`/hostels/${hostel.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            ) : null}
            {canManageHostel ? (
              archived ? (
                <ConfirmAction
                  trigger={
                    <Button variant="outline">
                      <ArchiveRestore />
                      Restore
                    </Button>
                  }
                  title="Restore this hostel?"
                  confirmLabel="Restore"
                  action={restoreHostelAction.bind(null, hostel.id)}
                />
              ) : (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" className="text-destructive">
                      <Archive />
                      Archive
                    </Button>
                  }
                  title={`Archive ${hostel.name}?`}
                  description="Archived hostels are hidden from day-to-day screens but stay in reports and history. Residents must be checked out first."
                  confirmLabel="Archive"
                  destructive
                  action={archiveHostelAction.bind(null, hostel.id)}
                />
              )
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Floors" value={hostel.floors.length} icon={Layers} />
        <StatCard label="Rooms" value={hostel.floors.reduce((s, f) => s + f._count.rooms, 0)} icon={DoorOpen} href={`/hostels/rooms`} />
        <StatCard label="Beds" value={hostel.occupancy.totalBeds} icon={BedDouble} hint={`${hostel.occupancy.availableBeds} available`} href={`/hostels/map?hostel=${hostel.id}`} />
        <StatCard label="Active residents" value={hostel.activeResidents} icon={Users} tone="info" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="rounded-xl border bg-card p-4">
            <OccupancyBar stats={hostel.occupancy} showLegend />
          </section>

          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Floors</h2>
              {canManageRooms && !archived ? (
                <div className="flex gap-2">
                  {hostel.floors.length > 0 ? (
                    <RoomDialog
                      floors={floorOptions}
                      trigger={
                        <Button size="sm" variant="outline">
                          <Plus />
                          Room
                        </Button>
                      }
                    />
                  ) : null}
                  <FloorDialog
                    hostels={[{ id: hostel.id, name: hostel.name }]}
                    defaultHostelId={hostel.id}
                    trigger={
                      <Button size="sm">
                        <Plus />
                        Floor
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </header>
            {hostel.floors.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Layers}
                  title="No floors yet"
                  description="Add a floor, then create rooms and beds on it."
                  className="border-0 py-8"
                />
              </div>
            ) : (
              <ul className="divide-y">
                {hostel.floors.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular">{f.floorNumber}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      {f.description ? <p className="truncate text-xs text-muted-foreground">{f.description}</p> : null}
                    </div>
                    <Link href={`/hostels/rooms?floorId=${f.id}`} className="text-sm text-muted-foreground hover:text-primary">
                      {f._count.rooms} room{f._count.rooms === 1 ? "" : "s"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {hostel.rules ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">House rules</h2>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{hostel.rules}</p>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="grid gap-3 text-sm">
              {hostel.address ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Address</dt>
                  <dd>{[hostel.address, hostel.city, hostel.country].filter(Boolean).join(", ")}</dd>
                </div>
              ) : null}
              {hostel.phone ? (
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-muted-foreground" />
                  <a href={`tel:${hostel.phone}`} className="hover:text-primary">{hostel.phone}</a>
                </div>
              ) : null}
              {hostel.email ? (
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  <a href={`mailto:${hostel.email}`} className="truncate hover:text-primary">{hostel.email}</a>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Manager</dt>
                <dd>{hostel.manager ? `${hostel.manager.firstName} ${hostel.manager.lastName}` : "Not assigned"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Rent configuration</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Bed rent</dt>
                <dd className="tabular">{money(hostel.defaultBedRent)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Deposit</dt>
                <dd className="tabular">{money(hostel.defaultDeposit)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Admission fee</dt>
                <dd className="tabular">{money(hostel.admissionFee)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Rent due</dt>
                <dd>Day {hostel.rentDueDay}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Late fee</dt>
                <dd className="tabular">{money(hostel.lateFeeAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Grace period</dt>
                <dd>{hostel.lateFeeGraceDays} days</dd>
              </div>
            </dl>
          </section>

          {hostel.amenities.length ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Amenities</h2>
              <div className="flex flex-wrap gap-1.5">
                {hostel.amenities.map((a) => (
                  <Badge key={a} variant="secondary">
                    {a}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Staff</h2>
              {can(ctx, "staff.view") ? (
                <Link href="/staff" className="text-xs text-muted-foreground hover:text-primary">
                  Manage
                </Link>
              ) : null}
            </div>
            {hostel.staffAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff assigned to this hostel.</p>
            ) : (
              <ul className="grid gap-2">
                {hostel.staffAssignments.map(({ staff }) => (
                  <li key={staff.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/staff/${staff.id}`} className="truncate hover:text-primary">
                      {staff.firstName} {staff.lastName}
                    </Link>
                    <span className="text-xs text-muted-foreground">{staffTypeLabels[staff.designation]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
