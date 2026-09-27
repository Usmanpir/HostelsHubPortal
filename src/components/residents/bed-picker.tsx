"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BedDouble, DoorOpen, Layers, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { BedTile } from "@/components/hostels/bed-tile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormatters } from "@/components/shared/org-context";
import { roomTypeLabels } from "@/config/labels";
import { cn } from "@/lib/utils";
import type { getHostelBedMap } from "@/services/resident/assignment-service";
import { hostelBedMapAction } from "@/app/(app)/residents/actions";
import { ChoiceCard } from "./wizard-shell";

export type HostelBedMap = Awaited<ReturnType<typeof getHostelBedMap>>;
export type MapFloor = HostelBedMap["floors"][number];
export type MapRoom = MapFloor["rooms"][number];
export type MapBed = MapRoom["beds"][number];

export type AssignableHostel = {
  id: string;
  name: string;
  code: string;
  city: string | null;
  defaultBedRent: number | null;
  defaultDeposit: number | null;
  admissionFee: number | null;
  availableBeds: number;
};

/** Load (and cache per hostel) the bed map used by the check-in wizard and transfer dialog. */
export function useHostelBedMap(hostelId: string | null, onLoaded?: (map: HostelBedMap) => void) {
  const [maps, setMaps] = useState<Record<string, HostelBedMap>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  const fetchMap = useCallback((id: string) => {
    startTransition(async () => {
      try {
        const res = await hostelBedMapAction(id);
        if (res.ok) {
          setMaps((prev) => ({ ...prev, [id]: res.data }));
          setFailed(null);
          onLoadedRef.current?.(res.data);
        } else {
          setFailed(id);
          toast.error(res.error);
        }
      } catch {
        setFailed(id);
        toast.error("Could not load beds. Check your connection and try again.");
      }
    });
  }, []);

  const cached = hostelId ? maps[hostelId] : undefined;
  useEffect(() => {
    if (hostelId && !cached && failed !== hostelId) fetchMap(hostelId);
  }, [hostelId, cached, failed, fetchMap]);

  return {
    map: cached ?? null,
    loading: pending || (!!hostelId && !cached && failed !== hostelId),
    failed: !!hostelId && !cached && failed === hostelId && !pending,
    reload: () => {
      if (hostelId) fetchMap(hostelId);
    },
  };
}

export function findBed(map: HostelBedMap | null, bedId: string) {
  for (const f of map?.floors ?? []) {
    for (const r of f.rooms) {
      const b = r.beds.find((x) => x.id === bedId);
      if (b) return { floor: f, room: r, bed: b };
    }
  }
  return null;
}

export function MapState({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        <p>We couldn&apos;t load the beds for this hostel.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw />
          Try again
        </Button>
      </div>
    );
  }
  return <MapSkeleton />;
}

export function MapSkeleton() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-xl" />
      ))}
    </div>
  );
}

export function HostelChoices({
  hostels,
  value,
  onChange,
}: {
  hostels: AssignableHostel[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const fmt = useFormatters();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {hostels.map((h) => (
        <ChoiceCard
          key={h.id}
          selected={value === h.id}
          onClick={() => onChange(h.id)}
          icon={<BedDouble className="size-4" />}
          title={h.name}
          subtitle={[h.code, h.city, h.defaultBedRent !== null ? `${fmt.money(h.defaultBedRent)}/bed` : null].filter(Boolean).join(" · ")}
          meta={
            <span className={cn("tabular", h.availableBeds === 0 ? "text-warning" : "text-success")}>
              {h.availableBeds} free
            </span>
          }
        />
      ))}
    </div>
  );
}

export function FloorChoices({ floors, value, onChange }: { floors: MapFloor[]; value: string | null; onChange: (id: string) => void }) {
  if (floors.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">This hostel has no floors yet.</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {floors.map((f) => (
        <ChoiceCard
          key={f.id}
          selected={value === f.id}
          disabled={f.availableBeds === 0}
          onClick={() => onChange(f.id)}
          icon={<Layers className="size-4" />}
          title={f.name}
          subtitle={`${f.rooms.length} room${f.rooms.length === 1 ? "" : "s"}`}
          meta={<span className="tabular">{f.availableBeds} free</span>}
        />
      ))}
    </div>
  );
}

export function RoomChoices({ rooms, value, onChange }: { rooms: MapRoom[]; value: string | null; onChange: (id: string) => void }) {
  const fmt = useFormatters();
  if (rooms.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No rooms on this floor.</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rooms.map((r) => {
        const rents = [...new Set(r.beds.filter((b) => b.selectable).map((b) => b.rent))];
        return (
          <ChoiceCard
            key={r.id}
            selected={value === r.id}
            disabled={r.availableBeds === 0}
            onClick={() => onChange(r.id)}
            icon={<DoorOpen className="size-4" />}
            title={`Room ${r.roomNumber}`}
            subtitle={
              r.blockedReason
                ? r.blockedReason
                : `${roomTypeLabels[r.roomType]} · ${r.beds.filter((b) => b.residentName).length}/${r.capacity} taken${rents.length === 1 ? ` · ${fmt.money(rents[0])}` : ""}`
            }
            meta={<span className="tabular">{r.availableBeds} free</span>}
          />
        );
      })}
    </div>
  );
}

/** Visual bed tiles; only selectable beds react to clicks. */
export function BedChoices({ room, value, onChange }: { room: MapRoom; value: string | null; onChange: (bed: MapBed) => void }) {
  const fmt = useFormatters();
  const selected = room.beds.find((b) => b.id === value);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {room.beds.map((b) => (
          <div
            key={b.id}
            className={cn(
              "rounded-lg [&>button]:w-full",
              value === b.id && "ring-2 ring-primary ring-offset-2 ring-offset-card",
              !b.selectable && "pointer-events-none opacity-50",
            )}
            aria-disabled={!b.selectable}
          >
            <BedTile
              bed={{ id: b.id, bedNumber: b.bedNumber, status: b.status, residentName: b.residentName }}
              onClick={b.selectable ? () => onChange(b) : undefined}
            />
          </div>
        ))}
      </div>
      {selected ? (
        <p className="text-sm text-muted-foreground">
          Bed {selected.bedNumber} · <span className="tabular font-medium text-foreground">{fmt.money(selected.rent)}</span> / month
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Tap a green bed to select it.</p>
      )}
    </div>
  );
}
