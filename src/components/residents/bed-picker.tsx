"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DoorOpen, Layers, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { BedTile } from "@/components/hostels/bed-tile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormatters, useTerms } from "@/components/shared/org-context";
import type { RentalMode } from "@/generated/prisma/enums";
import { roomTypeLabels } from "@/config/labels";
import { cn } from "@/lib/utils";
import type { getHostelBedMap } from "@/services/resident/assignment-service";
import { hostelBedMapAction } from "@/app/(app)/residents/actions";

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
  rentalMode?: RentalMode;
};

/** Whole-unit property: each unit has a single bed that stands for the whole unit. */
export function isWholeUnitMap(map: HostelBedMap | null | undefined) {
  return map?.hostel.rentalMode === "WHOLE_UNIT";
}

/** Human label for a picked bed: "Ground · Room 101 · Bed 2" or "Ground · Unit 101". */
export function pickedLabel(map: HostelBedMap | null, picked: ReturnType<typeof findBed>, unitWord = "Room") {
  if (!picked) return "—";
  return isWholeUnitMap(map)
    ? `${picked.floor.name} · Unit ${picked.room.roomNumber}`
    : `${picked.floor.name} · ${unitWord} ${picked.room.roomNumber} · Bed ${picked.bed.bedNumber}`;
}

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
  const t = useTerms();
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        <p>We couldn&apos;t load the {t.property === "Hostel" ? "beds" : "units"} for this {t.property.toLowerCase()}.</p>
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

/** Hostel dropdown for the check-in flow (hidden by callers when there is only one). */
export function HostelSelect({
  hostels,
  value,
  onChange,
}: {
  hostels: AssignableHostel[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const t = useTerms();
  return (
    <div className="grid gap-2">
      <Label htmlFor="bed-picker-hostel">{t.property}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id="bed-picker-hostel" className="h-11 w-full data-[size=default]:h-11">
          <SelectValue placeholder={`Choose a ${t.property.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {hostels.map((h) => (
            <SelectItem key={h.id} value={h.id}>
              {h.name}
              <span className={cn("tabular text-xs", h.availableBeds === 0 ? "text-warning" : "text-muted-foreground")}>
                {h.availableBeds} free
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * One-screen visual picker: floor chips on top, then every room on that floor
 * with its bed tiles. Only available beds are selectable.
 */
export function BedMapPicker({
  map,
  floorId,
  onFloorChange,
  value,
  onChange,
}: {
  map: HostelBedMap;
  floorId: string | null;
  onFloorChange: (id: string) => void;
  value: string | null;
  onChange: (bed: MapBed) => void;
}) {
  const fmt = useFormatters();
  const t = useTerms();
  const whole = isWholeUnitMap(map);
  if (map.floors.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        This {t.property.toLowerCase()} has no floors yet.
      </p>
    );
  }
  const floor = map.floors.find((f) => f.id === floorId) ?? map.floors.find((f) => f.availableBeds > 0) ?? map.floors[0]!;
  const selected = value ? findBed(map, value) : null;

  return (
    <div className="flex flex-col gap-4">
      {map.floors.length > 1 ? (
        <div role="group" aria-label="Floors" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {map.floors.map((f) => {
            const active = f.id === floor.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => onFloorChange(f.id)}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  !active && f.availableBeds === 0 && "text-muted-foreground",
                )}
              >
                <Layers className="size-4" />
                {f.name}
                <span className="tabular text-xs opacity-80">{f.availableBeds} free</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {floor.rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No {(whole ? "units" : t.units).toLowerCase()} on this floor.
        </p>
      ) : whole ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {floor.rooms.map((r) => {
            const b = r.beds[0];
            if (!b) return null;
            return (
              <div key={r.id} className="flex flex-col gap-1">
                <SelectableBed bed={b} selected={value === b.id} onSelect={onChange} label={`Unit ${r.roomNumber}`} />
                <span className="truncate px-1 text-xs text-muted-foreground">
                  {r.blockedReason ?? `${roomTypeLabels[r.roomType]} · ${fmt.money(b.rent)}`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {floor.rooms.map((r) => {
            const rents = [...new Set(r.beds.filter((b) => b.selectable).map((b) => b.rent))];
            const hasSelected = r.beds.some((b) => b.id === value);
            return (
              <div
                key={r.id}
                className={cn("rounded-xl border p-3", hasSelected && "border-primary ring-1 ring-primary", r.availableBeds === 0 && "bg-muted/30")}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <DoorOpen className="size-4 text-muted-foreground" />
                    {t.unit} {r.roomNumber}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {r.blockedReason ??
                      `${roomTypeLabels[r.roomType]} · ${r.availableBeds} free${rents.length === 1 ? ` · ${fmt.money(rents[0])}` : ""}`}
                  </span>
                </div>
                {r.beds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No beds in this room.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {r.beds.map((b) => (
                      <SelectableBed key={b.id} bed={b} selected={value === b.id} onSelect={onChange} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {selected ? (
          <>
            Selected: {pickedLabel(map, selected, t.unit)} ·{" "}
            <span className="tabular font-medium text-foreground">{fmt.money(selected.bed.rent)}</span> / month
          </>
        ) : whole ? (
          "Tap a green unit to select it."
        ) : (
          "Tap a green bed to select it."
        )}
      </p>
    </div>
  );
}

function SelectableBed({
  bed,
  selected,
  onSelect,
  label,
}: {
  bed: MapBed;
  selected: boolean;
  onSelect: (bed: MapBed) => void;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg [&>button]:w-full",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        !bed.selectable && "pointer-events-none opacity-50",
      )}
      aria-disabled={!bed.selectable}
    >
      <BedTile
        bed={{ id: bed.id, bedNumber: bed.bedNumber, status: bed.status, residentName: bed.residentName, label }}
        onClick={bed.selectable ? () => onSelect(bed) : undefined}
      />
    </div>
  );
}

/** Visual bed tiles for a single room; only selectable beds react to clicks. */
export function BedChoices({ room, value, onChange }: { room: MapRoom; value: string | null; onChange: (bed: MapBed) => void }) {
  const fmt = useFormatters();
  const selected = room.beds.find((b) => b.id === value);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {room.beds.map((b) => (
          <SelectableBed key={b.id} bed={b} selected={value === b.id} onSelect={onChange} />
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
