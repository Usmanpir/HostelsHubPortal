"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { bedSchema } from "@/lib/validation/property";
import type { AssignmentStatus, BedStatus } from "@/generated/prisma/enums";
import { createBedAction } from "@/app/(app)/hostels/actions";
import { BedTile } from "./bed-tile";
import { BedSheet, type BedDetail } from "./bed-sheet";

type RoomBed = {
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
};

export function RoomBeds({
  room,
}: {
  room: { id: string; roomNumber: string; capacity: number; rent: number | null; hostelName: string; beds: RoomBed[] };
}) {
  const [selected, setSelected] = useState<BedDetail | null>(null);
  const can = useCan();
  const canAdd = can("rooms.manage") && room.beds.length < room.capacity;

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Beds</h2>
          <p className="text-xs text-muted-foreground">
            {room.beds.length} of {room.capacity} beds configured · click a bed for details
          </p>
        </div>
        {canAdd ? <AddBedDialog roomId={room.id} nextNumber={String(room.beds.length + 1)} /> : null}
      </header>
      {room.beds.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No beds in this room yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {room.beds.map((bed) => {
            const a = bed.assignments[0] ?? null;
            return (
              <BedTile
                key={bed.id}
                bed={{ id: bed.id, bedNumber: bed.bedNumber, status: bed.status, residentName: a ? `${a.resident.firstName} ${a.resident.lastName}` : null }}
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
                    hostelName: room.hostelName,
                    assignment: a,
                  })
                }
              />
            );
          })}
        </div>
      )}
      <BedSheet bed={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </section>
  );
}

function AddBedDialog({ roomId, nextNumber }: { roomId: string; nextNumber: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { currency } = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: bedSchema,
    defaultValues: { roomId, bedNumber: nextNumber, notes: "" },
    action: createBedAction,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="Add bed"
      trigger={
        <Button size="sm">
          <Plus />
          Add bed
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField control={form.control} name="bedNumber" label="Bed number" required />
        <MoneyField control={form.control} name="monthlyRent" label="Monthly rent override" currency={currency} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Add bed</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
