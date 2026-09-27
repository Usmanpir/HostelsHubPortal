"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormGrid, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters } from "@/components/shared/org-context";
import { optionsFrom, roomTypeCapacity, roomTypeLabels } from "@/config/labels";
import { bulkRoomsSchema, roomSchema } from "@/lib/validation/property";
import type { RoomStatus, RoomType } from "@/generated/prisma/enums";
import { bulkCreateRoomsAction, createRoomAction, updateRoomAction } from "@/app/(app)/hostels/actions";

export type FloorOption = { id: string; name: string; hostelId: string; hostelName: string };

function floorOptions(floors: FloorOption[]) {
  const multiHostel = new Set(floors.map((f) => f.hostelId)).size > 1;
  return floors.map((f) => ({ value: f.id, label: multiHostel ? `${f.hostelName} · ${f.name}` : f.name }));
}

export function RoomDialog({
  trigger,
  floors,
  defaultFloorId,
  room,
}: {
  trigger: React.ReactNode;
  floors: FloorOption[];
  defaultFloorId?: string;
  room?: {
    id: string;
    floorId: string;
    roomNumber: string;
    roomType: RoomType;
    capacity: number;
    status: RoomStatus;
    rent: number | null;
    description: string | null;
    amenities: string[];
  };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { currency } = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: roomSchema,
    defaultValues: room
      ? {
          floorId: room.floorId,
          roomNumber: room.roomNumber,
          roomType: room.roomType,
          capacity: room.capacity,
          status: room.status,
          rent: room.rent ?? undefined,
          description: room.description ?? "",
          amenities: room.amenities.join(", "),
        }
      : { floorId: defaultFloorId ?? floors[0]?.id ?? "", roomNumber: "", roomType: "DOUBLE", capacity: 2, amenities: "" },
    action: (v) => (room ? updateRoomAction(room.id, v) : createRoomAction(v)),
    onSuccess: () => {
      setOpen(false);
      if (!room) form.reset();
      router.refresh();
    },
  });
  const c = form.control;

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={room ? `Edit room ${room.roomNumber}` : "Add room"}
      description={room ? undefined : "Beds are created automatically to match the room's capacity."}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField control={c} name="floorId" label="Floor" required options={floorOptions(floors)} />
        <FormGrid>
          <TextField control={c} name="roomNumber" label="Room number" required placeholder="101" />
          <SelectField
            control={c}
            name="roomType"
            label="Room type"
            options={optionsFrom(roomTypeLabels)}
            onValueChange={(v) => {
              const cap = roomTypeCapacity[v as RoomType];
              if (cap) form.setValue("capacity", cap);
            }}
          />
          <TextField control={c} name="capacity" label="Capacity (beds)" type="number" required />
          <MoneyField control={c} name="rent" label="Rent per bed" currency={currency} description="Overrides the hostel default." />
          {room ? (
            <SelectField
              control={c}
              name="status"
              label="Availability"
              options={[
                { value: room.status === "MAINTENANCE" || room.status === "INACTIVE" || room.status === "RESERVED" ? "AVAILABLE" : room.status, label: "In service" },
                { value: "MAINTENANCE", label: "Under maintenance" },
                { value: "RESERVED", label: "Reserved" },
                { value: "INACTIVE", label: "Inactive" },
              ]}
            />
          ) : null}
        </FormGrid>
        <TextField control={c} name="amenities" label="Amenities" placeholder="AC, Attached bath, Balcony" />
        <TextareaField control={c} name="description" label="Notes" rows={2} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{room ? "Save" : "Add room"}</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export function BulkRoomsDialog({ trigger, floors, defaultFloorId }: { trigger: React.ReactNode; floors: FloorOption[]; defaultFloorId?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { currency } = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: bulkRoomsSchema,
    defaultValues: { floorId: defaultFloorId ?? floors[0]?.id ?? "", prefix: "", startNumber: 101, count: 10, roomType: "DOUBLE", capacity: 2 },
    action: bulkCreateRoomsAction,
    onSuccess: (data) => {
      toast.success(`${(data as { created: number }).created} rooms created with beds`);
      setOpen(false);
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Add rooms in bulk"
      description="Create a numbered series of rooms (e.g. 101–110) with their beds in one step."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField control={c} name="floorId" label="Floor" required options={floorOptions(floors)} />
        <FormGrid className="sm:grid-cols-3">
          <TextField control={c} name="prefix" label="Prefix" placeholder="A-" />
          <TextField control={c} name="startNumber" label="First number" type="number" required />
          <TextField control={c} name="count" label="How many" type="number" required />
        </FormGrid>
        <FormGrid>
          <SelectField
            control={c}
            name="roomType"
            label="Room type"
            options={optionsFrom(roomTypeLabels)}
            onValueChange={(v) => {
              const cap = roomTypeCapacity[v as RoomType];
              if (cap) form.setValue("capacity", cap);
            }}
          />
          <TextField control={c} name="capacity" label="Beds per room" type="number" required />
        </FormGrid>
        <MoneyField control={c} name="rent" label="Rent per bed" currency={currency} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Create rooms</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
