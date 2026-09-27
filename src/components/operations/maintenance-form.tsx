"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { CheckboxField, FormGrid, FormSection, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { UploadedFile } from "@/components/shared/file-upload";
import { bedStatusLabels, maintenanceCategoryLabels, optionsFrom, staffTypeLabels } from "@/config/labels";
import type { BedStatus, StaffType } from "@/generated/prisma/enums";
import { maintenanceSchema } from "@/lib/validation/operations";
import { createMaintenanceAction } from "@/app/(app)/operations/actions";
import { PhotoUploader } from "./photo-uploader";
import { PriorityField } from "./priority-field";
import { ResidentField, useAssignableStaff, useHostelLocations, type ResidentOption } from "./pickers";

export type HostelChoice = { id: string; name: string };

export function staffOptionLabel(s: { name: string; designation: string; onLeave?: boolean }) {
  const role = staffTypeLabels[s.designation as StaffType] ?? s.designation;
  return `${s.name} · ${role}${s.onLeave ? " (on leave)" : ""}`;
}

/** New maintenance request — full page form, optimized for phones (photos straight from the camera roll). */
export function MaintenanceForm({
  hostels,
  defaultHostelId,
  canManageRooms,
}: {
  hostels: HostelChoice[];
  defaultHostelId?: string | null;
  canManageRooms: boolean;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [resident, setResident] = useState<ResidentOption | null>(null);
  const initialHostel = defaultHostelId ?? (hostels.length === 1 ? hostels[0]!.id : "");

  const { form, onSubmit, pending } = useActionForm({
    schema: maintenanceSchema,
    defaultValues: {
      hostelId: initialHostel,
      roomId: "",
      bedId: "",
      residentId: "",
      category: undefined,
      priority: "MEDIUM",
      title: "",
      description: "",
      assignedStaffId: "",
      photoFileIds: [],
      markBedMaintenance: false,
    },
    action: (values) => createMaintenanceAction({ ...values, photoFileIds: photos.map((p) => p.id) }),
    onSuccess: (data) => {
      router.push(`/operations/maintenance/${(data as { id: string }).id}`);
      router.refresh();
    },
  });
  const c = form.control;
  const hostelId = useWatch({ control: c, name: "hostelId" });
  const roomId = useWatch({ control: c, name: "roomId" });
  const bedId = useWatch({ control: c, name: "bedId" });

  const locations = useHostelLocations(hostelId);
  const staff = useAssignableStaff(hostelId);
  const rooms = locations.data ?? [];
  const room = rooms.find((r) => r.id === roomId);
  const bed = room?.beds.find((b) => b.id === bedId);
  const bedHeld = bed ? bed.status === "OCCUPIED" || bed.status === "RESERVED" : false;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection title="Issue" description="What's wrong and how urgent is it?">
        {hostels.length > 1 ? (
          <SelectField
            control={c}
            name="hostelId"
            label="Hostel"
            required
            options={hostels.map((h) => ({ value: h.id, label: h.name }))}
            onValueChange={() => {
              form.setValue("roomId", "");
              form.setValue("bedId", "");
              form.setValue("residentId", "");
              form.setValue("assignedStaffId", "");
              form.setValue("markBedMaintenance", false);
              setResident(null);
            }}
          />
        ) : null}
        <TextField control={c} name="title" label="Title" required placeholder="Ceiling fan not working" />
        <FormGrid>
          <SelectField control={c} name="category" label="Category" required options={optionsFrom(maintenanceCategoryLabels)} />
          <PriorityField control={c} name="priority" />
        </FormGrid>
        <TextareaField control={c} name="description" label="Details" rows={3} placeholder="Describe the problem, when it started, access instructions…" />
      </FormSection>

      <FormSection title="Location" description="Optional — helps staff find the problem quickly.">
        <FormGrid>
          <SelectField
            control={c}
            name="roomId"
            label="Room"
            allowEmpty="Common area / not room-specific"
            placeholder={locations.isLoading ? "Loading rooms…" : "Select room"}
            disabled={!hostelId || locations.isLoading}
            options={rooms.map((r) => ({ value: r.id, label: `Room ${r.roomNumber} · ${r.floorName}` }))}
            onValueChange={() => {
              form.setValue("bedId", "");
              form.setValue("markBedMaintenance", false);
            }}
          />
          <SelectField
            control={c}
            name="bedId"
            label="Bed"
            allowEmpty="Whole room"
            disabled={!room || room.beds.length === 0}
            options={(room?.beds ?? []).map((b) => ({ value: b.id, label: `Bed ${b.bedNumber} · ${bedStatusLabels[b.status as BedStatus] ?? b.status}` }))}
            onValueChange={() => form.setValue("markBedMaintenance", false)}
          />
        </FormGrid>
        {locations.isError ? <p className="text-sm text-destructive">{locations.error.message}</p> : null}
        {bed && canManageRooms ? (
          <CheckboxField
            control={c}
            name="markBedMaintenance"
            label="Mark bed as under maintenance"
            description={
              bedHeld
                ? "Not available — a resident currently holds this bed."
                : "Takes the bed out of service so it can't be allocated until the job is done."
            }
            disabled={bedHeld || bed.status === "MAINTENANCE"}
          />
        ) : null}
        <ResidentField
          control={c}
          name="residentId"
          label="Reported by / affects resident"
          hostelId={hostelId}
          selected={resident}
          onSelectedChange={setResident}
          description="The resident is notified as the request progresses."
        />
      </FormSection>

      <FormSection title="Photos" description="Snap the problem — before photos help with triage.">
        <PhotoUploader value={photos} onChange={setPhotos} />
      </FormSection>

      <FormSection title="Assignment" description="Assigning a staff member moves the request to Assigned and notifies them.">
        <SelectField
          control={c}
          name="assignedStaffId"
          label="Assign to"
          allowEmpty="Unassigned"
          placeholder={staff.isLoading ? "Loading staff…" : "Select staff"}
          disabled={!hostelId || staff.isLoading}
          options={(staff.data ?? []).map((s) => ({ value: s.id, label: staffOptionLabel(s) }))}
          description={
            staff.isError
              ? staff.error.message
              : hostelId && staff.data && staff.data.length === 0
                ? "No staff are assigned to this hostel yet."
                : undefined
          }
        />
      </FormSection>

      <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-2 border-t bg-card/95 p-4 backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <SubmitButton pending={pending} className="flex-1 sm:flex-none">
          Create request
        </SubmitButton>
      </div>
    </form>
  );
}
