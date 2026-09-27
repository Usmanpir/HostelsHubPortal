"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BedDouble, DoorOpen, Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { roomTypeLabels } from "@/config/labels";
import { formatMoney } from "@/lib/format";
import { addBedAction } from "@/app/onboarding/actions";
import type { OnboardingFloor } from "./types";
import { StepCard, StepFooter } from "./wizard-chrome";

export function BedsStep({ floors, currency }: { floors: OnboardingFloor[]; currency: string }) {
  const router = useRouter();
  const [busyRoom, setBusyRoom] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const rooms = floors.flatMap((f) => f.rooms);
  const beds = rooms.reduce((n, r) => n + r.bedCount, 0);

  const addBed = (roomId: string) => {
    setBusyRoom(roomId);
    startTransition(async () => {
      try {
        const result = await addBedAction(roomId);
        if (result.ok) {
          toast.success(`Bed ${result.data.bedNumber} added`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Please try again.");
      } finally {
        setBusyRoom(null);
      }
    });
  };

  return (
    <StepCard
      eyebrow="Step 5"
      title="Review beds"
      description="Each room got one bed per place. Add extra beds where you need them — you can fine-tune bed numbers and rent later."
    >
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Summary icon={Layers} label="Floors" value={floors.length} />
        <Summary icon={DoorOpen} label="Rooms" value={rooms.length} />
        <Summary icon={BedDouble} label="Beds" value={beds} />
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No rooms yet"
          description="Create rooms first — their beds will show up here."
          action={
            <Button asChild variant="outline">
              <Link href="/onboarding?step=4">Create rooms</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5">
          {floors
            .filter((f) => f.rooms.length)
            .map((floor) => (
              <div key={floor.id}>
                <h2 className="mb-2 text-sm font-medium">{floor.name}</h2>
                <ul className="divide-y rounded-xl border">
                  {floor.rooms.map((room) => (
                    <li key={room.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="w-16 font-medium tabular">{room.roomNumber}</span>
                      <span className="text-sm text-muted-foreground">{roomTypeLabels[room.roomType]}</span>
                      <span className="flex gap-1" aria-label={`${room.bedCount} beds`}>
                        {Array.from({ length: Math.min(room.bedCount, 12) }).map((_, i) => (
                          <span key={i} className="h-4 w-3 rounded-sm bg-success/60" aria-hidden />
                        ))}
                        {room.bedCount > 12 ? <span className="text-xs text-muted-foreground">+{room.bedCount - 12}</span> : null}
                      </span>
                      <span className="text-xs text-muted-foreground tabular">
                        {room.bedCount} bed{room.bedCount === 1 ? "" : "s"}
                        {room.rent !== null ? ` · ${formatMoney(room.rent, currency)}/bed` : ""}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ms-auto"
                        onClick={() => addBed(room.id)}
                        disabled={busyRoom !== null || room.bedCount >= 50}
                        aria-label={`Add a bed to room ${room.roomNumber}`}
                      >
                        {busyRoom === room.id ? <Spinner /> : <Plus />}
                        Add bed
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      <StepFooter step={5}>
        <Button asChild className="h-9 px-4">
          <Link href="/onboarding?step=6">
            Looks good
            <ArrowRight />
          </Link>
        </Button>
      </StepFooter>
    </StepCard>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</p>
    </div>
  );
}
