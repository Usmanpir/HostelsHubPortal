"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { floorSchema } from "@/lib/validation/property";
import { createFloorAction, updateFloorAction } from "@/app/(app)/hostels/actions";

export function FloorDialog({
  trigger,
  hostels,
  defaultHostelId,
  floor,
}: {
  trigger: React.ReactNode;
  hostels: { id: string; name: string }[];
  defaultHostelId?: string | null;
  floor?: { id: string; hostelId: string; name: string; floorNumber: number; description: string | null };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: floorSchema,
    defaultValues: floor
      ? { hostelId: floor.hostelId, name: floor.name, floorNumber: floor.floorNumber, description: floor.description ?? "" }
      : { hostelId: defaultHostelId ?? hostels[0]?.id ?? "", name: "", floorNumber: 0, description: "" },
    action: (v) => (floor ? updateFloorAction(floor.id, v) : createFloorAction(v)),
    onSuccess: () => {
      setOpen(false);
      if (!floor) form.reset();
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={floor ? "Edit floor" : "Add floor"}
      description="Floors group rooms inside a hostel, e.g. Ground Floor (0), First Floor (1)."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField
          control={c}
          name="hostelId"
          label="Hostel"
          required
          disabled={!!floor}
          options={hostels.map((h) => ({ value: h.id, label: h.name }))}
        />
        <FormGrid>
          <TextField control={c} name="name" label="Name" required placeholder="First Floor" />
          <TextField control={c} name="floorNumber" label="Floor number" type="number" required />
        </FormGrid>
        <TextareaField control={c} name="description" label="Description" rows={2} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{floor ? "Save" : "Add floor"}</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
