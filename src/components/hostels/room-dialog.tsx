"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Control, FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormGrid, MoneyField, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters, useTerms } from "@/components/shared/org-context";
import { optionsFrom, roomTypeCapacity, roomTypeLabels } from "@/config/labels";
import { BED_ROOM_TYPES, bulkRoomsSchema, roomSchema, WHOLE_UNIT_TYPES } from "@/lib/validation/property";
import type { RentalMode, RoomStatus, RoomType } from "@/generated/prisma/enums";
import { bulkCreateRoomsAction, createRoomAction, updateRoomAction } from "@/app/(app)/hostels/actions";

export type FloorOption = { id: string; name: string; hostelId: string; hostelName: string; rentalMode?: RentalMode };

const typeOptions = (types: readonly RoomType[]) => types.map((t) => ({ value: t, label: roomTypeLabels[t] }));
const WHOLE_UNIT_TYPE_OPTIONS = typeOptions(WHOLE_UNIT_TYPES);
const BED_TYPE_OPTIONS = typeOptions(BED_ROOM_TYPES);
const isWholeUnitType = (t: RoomType | undefined) => !!t && (WHOLE_UNIT_TYPES as readonly string[]).includes(t);

function floorOptions(floors: FloorOption[]) {
  const multiHostel = new Set(floors.map((f) => f.hostelId)).size > 1;
  return floors.map((f) => ({ value: f.id, label: multiHostel ? `${f.hostelName} · ${f.name}` : f.name }));
}

function isWholeUnitFloor(floors: FloorOption[], floorId: string | undefined) {
  return floors.find((f) => f.id === floorId)?.rentalMode === "WHOLE_UNIT";
}

type ModeForm = {
  getValues: (name: "roomType") => RoomType | undefined;
  setValue: (name: "roomType" | "capacity", value: RoomType | number) => void;
};

/** Keep room type / capacity consistent with the selected floor's rental mode. */
function syncModeFields(form: ModeForm, wholeUnit: boolean) {
  const type = form.getValues("roomType");
  if (wholeUnit) {
    if (!isWholeUnitType(type)) form.setValue("roomType", "APARTMENT");
    form.setValue("capacity", 1);
  } else if (isWholeUnitType(type)) {
    form.setValue("roomType", "DOUBLE");
    form.setValue("capacity", 2);
  }
}

function UnitDetailsFields<T extends FieldValues>({ control }: { control: Control<T> }) {
  const c = control as unknown as Control<{ bedrooms: number; bathrooms: number; areaSqft: number; furnished: boolean }>;
  return (
    <>
      <FormGrid className="sm:grid-cols-3">
        <TextField control={c} name="bedrooms" label="Bedrooms" type="number" />
        <TextField control={c} name="bathrooms" label="Bathrooms" type="number" />
        <TextField control={c} name="areaSqft" label="Area (sq ft)" type="number" />
      </FormGrid>
      <SwitchField control={c} name="furnished" label="Furnished" />
    </>
  );
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
    bedrooms?: number | null;
    bathrooms?: number | null;
    areaSqft?: number | null;
    furnished?: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { currency } = useFormatters();
  const t = useTerms();
  const initialFloorId = room?.floorId ?? defaultFloorId ?? floors[0]?.id ?? "";
  const initialWhole = isWholeUnitFloor(floors, initialFloorId);
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
          bedrooms: room.bedrooms ?? undefined,
          bathrooms: room.bathrooms ?? undefined,
          areaSqft: room.areaSqft ?? undefined,
          furnished: room.furnished ?? false,
        }
      : {
          floorId: initialFloorId,
          roomNumber: "",
          roomType: initialWhole ? "APARTMENT" : "DOUBLE",
          capacity: initialWhole ? 1 : 2,
          amenities: "",
          furnished: false,
        },
    action: (v) => (room ? updateRoomAction(room.id, v) : createRoomAction(v)),
    onSuccess: () => {
      setOpen(false);
      if (!room) form.reset();
      router.refresh();
    },
  });
  const c = form.control;
  const wholeUnit = isWholeUnitFloor(floors, form.watch("floorId"));
  const unitWord = wholeUnit ? "unit" : t.unit.toLowerCase();

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={room ? `Edit ${unitWord} ${room.roomNumber}` : `Add ${unitWord}`}
      description={
        room
          ? undefined
          : wholeUnit
            ? "The unit is leased to one tenant as a whole."
            : "Beds are created automatically to match the room's capacity."
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField
          control={c}
          name="floorId"
          label="Floor"
          required
          options={floorOptions(floors)}
          onValueChange={(v) => syncModeFields(form as unknown as ModeForm, isWholeUnitFloor(floors, v))}
        />
        <FormGrid>
          <TextField control={c} name="roomNumber" label={wholeUnit ? "Unit number" : `${t.unit} number`} required placeholder="101" />
          <SelectField
            control={c}
            name="roomType"
            label={wholeUnit ? "Unit type" : `${t.unit} type`}
            options={
              wholeUnit ? WHOLE_UNIT_TYPE_OPTIONS : isWholeUnitType(room?.roomType) ? optionsFrom(roomTypeLabels) : BED_TYPE_OPTIONS
            }
            onValueChange={(v) => {
              if (wholeUnit) return form.setValue("capacity", 1);
              const cap = roomTypeCapacity[v as RoomType];
              if (cap) form.setValue("capacity", cap);
            }}
          />
          {wholeUnit ? null : <TextField control={c} name="capacity" label="Capacity (beds)" type="number" required />}
          <MoneyField
            control={c}
            name="rent"
            label={wholeUnit ? "Monthly rent" : "Rent per bed"}
            currency={currency}
            description={`Overrides the ${t.property.toLowerCase()} default.`}
          />
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
        {wholeUnit ? <UnitDetailsFields control={c} /> : null}
        <TextField control={c} name="amenities" label="Amenities" placeholder="AC, Attached bath, Balcony" />
        <TextareaField control={c} name="description" label="Notes" rows={2} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{room ? "Save" : `Add ${unitWord}`}</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export function BulkRoomsDialog({ trigger, floors, defaultFloorId }: { trigger: React.ReactNode; floors: FloorOption[]; defaultFloorId?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { currency } = useFormatters();
  const t = useTerms();
  const initialFloorId = defaultFloorId ?? floors[0]?.id ?? "";
  const initialWhole = isWholeUnitFloor(floors, initialFloorId);
  const { form, onSubmit, pending } = useActionForm({
    schema: bulkRoomsSchema,
    defaultValues: {
      floorId: initialFloorId,
      prefix: "",
      startNumber: 101,
      count: 10,
      roomType: initialWhole ? "APARTMENT" : "DOUBLE",
      capacity: initialWhole ? 1 : 2,
      furnished: false,
    },
    action: bulkCreateRoomsAction,
    onSuccess: (data) => {
      const created = (data as { created: number }).created;
      toast.success(
        isWholeUnitFloor(floors, form.getValues("floorId"))
          ? `${created} units created`
          : `${created} ${t.units.toLowerCase()} created with beds`,
      );
      setOpen(false);
      router.refresh();
    },
  });
  const c = form.control;
  const wholeUnit = isWholeUnitFloor(floors, form.watch("floorId"));
  const units = wholeUnit ? "units" : t.units.toLowerCase();
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={`Add ${units} in bulk`}
      description={
        wholeUnit
          ? "Create a numbered series of units (e.g. 101–110) in one step."
          : `Create a numbered series of ${units} (e.g. 101–110) with their beds in one step.`
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField
          control={c}
          name="floorId"
          label="Floor"
          required
          options={floorOptions(floors)}
          onValueChange={(v) => syncModeFields(form as unknown as ModeForm, isWholeUnitFloor(floors, v))}
        />
        <FormGrid className="sm:grid-cols-3">
          <TextField control={c} name="prefix" label="Prefix" placeholder="A-" />
          <TextField control={c} name="startNumber" label="First number" type="number" required />
          <TextField control={c} name="count" label="How many" type="number" required />
        </FormGrid>
        <FormGrid>
          <SelectField
            control={c}
            name="roomType"
            label={wholeUnit ? "Unit type" : `${t.unit} type`}
            options={wholeUnit ? WHOLE_UNIT_TYPE_OPTIONS : BED_TYPE_OPTIONS}
            onValueChange={(v) => {
              if (wholeUnit) return form.setValue("capacity", 1);
              const cap = roomTypeCapacity[v as RoomType];
              if (cap) form.setValue("capacity", cap);
            }}
          />
          {wholeUnit ? (
            <MoneyField control={c} name="rent" label="Monthly rent" currency={currency} />
          ) : (
            <TextField control={c} name="capacity" label={`Beds per ${t.unit.toLowerCase()}`} type="number" required />
          )}
        </FormGrid>
        {wholeUnit ? <UnitDetailsFields control={c} /> : <MoneyField control={c} name="rent" label="Rent per bed" currency={currency} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{`Create ${units}`}</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
