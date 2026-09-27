"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { ArrowRight, BedDouble, DoorOpen, Plus } from "lucide-react";
import { FormGrid, MoneyField, SelectField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { optionsFrom, roomTypeCapacity, roomTypeLabels } from "@/config/labels";
import type { RoomType } from "@/generated/prisma/enums";
import { bulkRoomsSchema } from "@/lib/validation/property";
import { bulkRoomsAction } from "@/app/onboarding/actions";
import type { OnboardingFloor } from "./types";
import { StepCard, StepFooter } from "./wizard-chrome";

function nextRoomNumber(floor: OnboardingFloor) {
  const numeric = floor.rooms.map((r) => Number(r.roomNumber)).filter((n) => Number.isInteger(n) && n >= 0);
  if (numeric.length) return Math.max(...numeric) + 1;
  return floor.floorNumber <= 0 ? 1 : floor.floorNumber * 100 + 1;
}

export function RoomsStep({ floors, currency, defaultRent }: { floors: OnboardingFloor[]; currency: string; defaultRent: number | null }) {
  const totalRooms = floors.reduce((n, f) => n + f.rooms.length, 0);

  return (
    <StepCard
      eyebrow="Step 4"
      title="Create rooms"
      description="Generate rooms floor by floor. Beds are created automatically for each room."
    >
      {floors.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="Add a floor first"
          description="Rooms belong to floors. Go back and add at least one floor."
          action={
            <Button asChild variant="outline">
              <Link href="/onboarding?step=3">Add floors</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {floors.map((floor) => (
            <FloorRooms key={floor.id} floor={floor} currency={currency} defaultRent={defaultRent} />
          ))}
        </div>
      )}
      <StepFooter step={4} skipTo={totalRooms ? undefined : 6} skipLabel="Skip for now">
        {totalRooms ? (
          <Button asChild className="h-9 px-4">
            <Link href="/onboarding?step=5">
              Review beds
              <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </StepFooter>
    </StepCard>
  );
}

function FloorRooms({ floor, currency, defaultRent }: { floor: OnboardingFloor; currency: string; defaultRent: number | null }) {
  const [open, setOpen] = useState(floor.rooms.length === 0);
  const beds = floor.rooms.reduce((n, r) => n + r.bedCount, 0);

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium">{floor.name}</p>
          <p className="text-xs text-muted-foreground">
            {floor.rooms.length
              ? `${floor.rooms.length} room${floor.rooms.length === 1 ? "" : "s"} · ${beds} bed${beds === 1 ? "" : "s"}`
              : "No rooms yet"}
          </p>
        </div>
        {!open ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus />
            Add rooms
          </Button>
        ) : null}
      </div>
      {floor.rooms.length ? (
        <ul className="flex flex-wrap gap-1.5 border-t px-4 py-3" aria-label={`Rooms on ${floor.name}`}>
          {floor.rooms.map((r) => (
            <li key={r.id} className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-0.5 text-xs tabular">
              {r.roomNumber}
              <span className="text-muted-foreground">· {r.bedCount}</span>
              <BedDouble className="size-3 text-muted-foreground" aria-label="beds" />
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <BulkRoomsForm floor={floor} currency={currency} defaultRent={defaultRent} onDone={() => setOpen(false)} canCancel={floor.rooms.length > 0} />
      ) : null}
    </div>
  );
}

function BulkRoomsForm({
  floor,
  currency,
  defaultRent,
  onDone,
  canCancel,
}: {
  floor: OnboardingFloor;
  currency: string;
  defaultRent: number | null;
  onDone: () => void;
  canCancel: boolean;
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: bulkRoomsSchema,
    defaultValues: {
      floorId: floor.id,
      prefix: "",
      startNumber: nextRoomNumber(floor),
      count: 4,
      roomType: "DOUBLE",
      capacity: 2,
      rent: defaultRent ?? undefined,
    },
    action: bulkRoomsAction,
    successMessage: (data) => `Created ${data.created} room${data.created === 1 ? "" : "s"} on ${floor.name}`,
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  const c = form.control;
  const [prefix, start, count, capacity] = useWatch({ control: c, name: ["prefix", "startNumber", "count", "capacity"] });
  const s = Number(start);
  const n = Number(count);
  const cap = Number(capacity);
  const valid = Number.isInteger(s) && Number.isInteger(n) && n > 0 && Number.isInteger(cap) && cap > 0;
  const p = typeof prefix === "string" ? prefix.trim() : "";

  return (
    <form onSubmit={onSubmit} className="grid gap-4 border-t bg-muted/20 px-4 py-4" noValidate>
      <FormGrid className="lg:grid-cols-3">
        <TextField control={c} name="count" label="Number of rooms" type="number" inputMode="numeric" required />
        <TextField control={c} name="startNumber" label="First room number" type="number" inputMode="numeric" required />
        <TextField control={c} name="prefix" label="Prefix" placeholder="e.g. A-" description="Optional" />
        <SelectField
          control={c}
          name="roomType"
          label="Room type"
          options={optionsFrom(roomTypeLabels)}
          onValueChange={(v) => {
            const preset = roomTypeCapacity[v as RoomType];
            if (preset) form.setValue("capacity", preset, { shouldValidate: true });
          }}
        />
        <TextField control={c} name="capacity" label="Beds per room" type="number" inputMode="numeric" required />
        <MoneyField control={c} name="rent" label="Rent per bed" currency={currency} description="Optional" />
      </FormGrid>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {valid
            ? n === 1
              ? `Creates room ${p}${s} with ${cap} bed${cap === 1 ? "" : "s"}.`
              : `Creates rooms ${p}${s}–${p}${s + n - 1} with ${cap} bed${cap === 1 ? "" : "s"} each (${n * cap} beds).`
            : "Enter the number of rooms and beds."}
        </p>
        <div className="flex gap-2">
          {canCancel ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
          <SubmitButton pending={pending} pendingText="Creating…">
            Create rooms
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
