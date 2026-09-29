"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EnumBadge } from "@/components/shared/status-badge";
import { useTerms } from "@/components/shared/org-context";
import { roomStatusLabels, roomStatusTones } from "@/config/labels";
import type { BedStatus, RoomStatus, AssignmentStatus } from "@/generated/prisma/enums";
import { BedTile } from "./bed-tile";
import { BedSheet, type BedDetail } from "./bed-sheet";

export type MapFloor = {
  id: string;
  name: string;
  floorNumber: number;
  rooms: {
    id: string;
    roomNumber: string;
    status: RoomStatus;
    capacity: number;
    rent: number | null;
    beds: {
      id: string;
      bedNumber: string;
      status: BedStatus;
      monthlyRent: number | null;
      notes: string | null;
      assignments: {
        id: string;
        status: AssignmentStatus;
        checkInDate: Date;
        monthlyRent: number;
        resident: { id: string; firstName: string; lastName: string; residentCode: string; phone: string };
      }[];
    }[];
  }[];
};

type Filter = "ALL" | "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "RESERVED";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "AVAILABLE", label: "Available" },
  { value: "OCCUPIED", label: "Occupied" },
  { value: "RESERVED", label: "Reserved" },
  { value: "MAINTENANCE", label: "Maintenance" },
];

/** Interactive building visualizer: floors → rooms → colour-coded beds. */
export function RoomMap({
  floors,
  hostelName,
  wholeUnit = false,
}: {
  floors: MapFloor[];
  hostelName?: string;
  /** Whole-unit property: one tile per unit (its single bed) instead of room cards with beds. */
  wholeUnit?: boolean;
}) {
  const t = useTerms();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<BedDetail | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: 0, AVAILABLE: 0, OCCUPIED: 0, RESERVED: 0, MAINTENANCE: 0 };
    for (const f of floors) for (const r of f.rooms) for (const b of r.beds) {
      c.ALL!++;
      if (b.status in c) c[b.status]!++;
    }
    return c;
  }, [floors]);

  const visibleFloors = floors
    .map((f) => ({
      ...f,
      rooms: f.rooms
        .map((r) => ({ ...r, beds: filter === "ALL" ? r.beds : r.beds.filter((b) => b.status === filter) }))
        .filter((r) => filter === "ALL" || r.beds.length > 0),
    }))
    .filter((f) => f.rooms.length > 0 || filter === "ALL");

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => v && setFilter(v as Filter)}
        variant="outline"
        size="sm"
        className="flex-wrap justify-start"
      >
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="gap-1.5 px-3">
            {f.label}
            <span className="tabular text-xs text-muted-foreground">{counts[f.value]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {visibleFloors.length === 0 ? (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          {wholeUnit ? "No units match this filter." : "No beds match this filter."}
        </p>
      ) : null}

      {visibleFloors.map((floor) => (
        <section key={floor.id} className="rounded-xl border bg-card">
          <header className="flex items-center justify-between border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">{floor.name}</h3>
            <span className="text-xs text-muted-foreground">
              {floor.rooms.length} {(wholeUnit ? "units" : t.units).toLowerCase()}
            </span>
          </header>
          {floor.rooms.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No {(wholeUnit ? "units" : t.units).toLowerCase()} on this floor yet.
            </p>
          ) : wholeUnit ? (
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {floor.rooms.map((room) => {
                const bed = room.beds[0];
                if (!bed) {
                  return (
                    <Link
                      key={room.id}
                      href={`/hostels/rooms/${room.id}`}
                      className="flex h-12 items-center rounded-lg border border-dashed px-2.5 text-xs text-muted-foreground hover:text-primary"
                    >
                      Unit {room.roomNumber} · not set up
                    </Link>
                  );
                }
                const a = bed.assignments[0] ?? null;
                return (
                  <BedTile
                    key={room.id}
                    bed={{
                      id: bed.id,
                      bedNumber: bed.bedNumber,
                      status: bed.status,
                      label: `Unit ${room.roomNumber}`,
                      residentName: a ? `${a.resident.firstName} ${a.resident.lastName}` : null,
                    }}
                    onClick={() =>
                      setSelected({
                        id: bed.id,
                        bedNumber: bed.bedNumber,
                        status: bed.status,
                        monthlyRent: bed.monthlyRent,
                        notes: bed.notes,
                        roomId: room.id,
                        roomNumber: room.roomNumber,
                        roomRent: room.rent,
                        hostelName,
                        wholeUnit: true,
                        assignment: a,
                      })
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {floor.rooms.map((room) => (
                <div key={room.id} className="rounded-lg border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Link href={`/hostels/rooms/${room.id}`} className="text-sm font-semibold hover:text-primary">
                      {t.unit} {room.roomNumber}
                    </Link>
                    <EnumBadge value={room.status} labels={roomStatusLabels} tones={roomStatusTones} />
                  </div>
                  {room.beds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No beds yet</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {room.beds.map((bed) => {
                        const a = bed.assignments[0] ?? null;
                        return (
                          <BedTile
                            key={bed.id}
                            bed={{
                              id: bed.id,
                              bedNumber: bed.bedNumber,
                              status: bed.status,
                              residentName: a ? `${a.resident.firstName} ${a.resident.lastName}` : null,
                            }}
                            onClick={() =>
                              setSelected({
                                id: bed.id,
                                bedNumber: bed.bedNumber,
                                status: bed.status,
                                monthlyRent: bed.monthlyRent,
                                notes: bed.notes,
                                roomId: room.id,
                                roomNumber: room.roomNumber,
                                roomRent: room.rent,
                                hostelName,
                                assignment: a,
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <BedSheet bed={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
