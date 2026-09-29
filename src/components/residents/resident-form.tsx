"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { Controller, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { MoreDetails, SubHeading } from "@/components/forms/more-details";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { uploadFile } from "@/components/shared/file-upload";
import { genderLabels, optionsFrom, residentStatusLabels } from "@/config/labels";
import { EDITABLE_RESIDENT_STATUSES, residentSchema, type ResidentInput, type ResidentValues } from "@/lib/validation/resident";
import { createResidentAction, updateResidentAction } from "@/app/(app)/residents/actions";
import { ResidentAvatar } from "./resident-avatar";

/** Optional profile fields shown under "More details" (opened automatically on errors). */
const MORE_FIELDS = [
  "email",
  "alternatePhone",
  "gender",
  "dateOfBirth",
  "idNumber",
  "nationality",
  "address",
  "city",
  "occupation",
  "institution",
  "expectedLeavingDate",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
  "guardianName",
  "guardianPhone",
  "notes",
  "photoFileId",
] as const satisfies readonly (keyof ResidentInput)[];

export function ResidentForm({
  residentId,
  initial,
  hostels,
  lockHostel,
  lockedStatus,
  returnTo,
}: {
  residentId?: string;
  initial: ResidentInput;
  hostels: { id: string; name: string }[];
  /** The resident has a bed: hostel follows the bed (use a transfer). */
  lockHostel?: boolean;
  /** Status controlled by a workflow (e.g. checked out); shown read-only. */
  lockedStatus?: string;
  /** Where to go after creating (e.g. back into the check-in wizard). */
  returnTo?: { kind: "check-in"; bedId?: string };
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: residentSchema,
    defaultValues: initial,
    action: (values) => (residentId ? updateResidentAction(residentId, values) : createResidentAction(values)),
    onSuccess: (data) => {
      const id = (data as { id: string }).id;
      if (!residentId && returnTo?.kind === "check-in") {
        router.push(`/residents/check-in?residentId=${id}${returnTo.bedId ? `&bedId=${returnTo.bedId}` : ""}`);
      } else {
        router.push(`/residents/${id}`);
      }
      router.refresh();
    },
  });
  const c = form.control;
  const errors = form.formState.errors;
  const firstName = useWatch({ control: c, name: "firstName" });
  const lastName = useWatch({ control: c, name: "lastName" });
  const showHostel = hostels.length !== 1 || !hostels.some((h) => h.id === initial.hostelId) || !!lockHostel;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormGrid>
        <TextField control={c} name="firstName" label="First name" required autoComplete="off" />
        <TextField control={c} name="lastName" label="Last name" required autoComplete="off" />
        <TextField control={c} name="phone" label="Phone" type="tel" required inputMode="tel" placeholder="+92 300 1234567" />
        <TextField control={c} name="joiningDate" label="Joining date" type="date" required />
        {showHostel ? (
          <SelectField
            control={c}
            name="hostelId"
            label="Hostel"
            required
            disabled={lockHostel}
            options={hostels.map((h) => ({ value: h.id, label: h.name }))}
            description={lockHostel ? "Use a transfer to move the resident to another hostel." : undefined}
          />
        ) : null}
        {residentId ? (
          lockedStatus ? (
            <div className="grid gap-2 text-sm">
              <span className="font-medium">Status</span>
              <span className="flex h-8 items-center rounded-lg border bg-muted/40 px-2.5 text-muted-foreground">{lockedStatus}</span>
            </div>
          ) : (
            <SelectField
              control={c}
              name="status"
              label="Status"
              options={EDITABLE_RESIDENT_STATUSES.map((s) => ({ value: s, label: residentStatusLabels[s] }))}
            />
          )
        ) : null}
      </FormGrid>

      <MoreDetails errors={errors} fields={MORE_FIELDS} hint="Email, CNIC, address, emergency contact, guardian, photo, notes">
        <PhotoField control={c} name={`${firstName ?? ""} ${lastName ?? ""}`} />
        <SubHeading>Contact</SubHeading>
        <FormGrid>
          <TextField control={c} name="email" label="Email" type="email" autoComplete="off" description="Needed for resident portal access." />
          <TextField control={c} name="alternatePhone" label="Alternate phone" type="tel" inputMode="tel" />
          <TextField control={c} name="address" label="Home address" className="sm:col-span-2" />
          <TextField control={c} name="city" label="City" />
        </FormGrid>
        <SubHeading>Identity</SubHeading>
        <FormGrid>
          <SelectField control={c} name="gender" label="Gender" allowEmpty="Not specified" options={optionsFrom(genderLabels)} />
          <TextField control={c} name="dateOfBirth" label="Date of birth" type="date" />
          <TextField control={c} name="idNumber" label="CNIC / Passport no." placeholder="35202-1234567-1" />
          <TextField control={c} name="nationality" label="Nationality" />
        </FormGrid>
        <SubHeading>Stay & occupation</SubHeading>
        <FormGrid>
          <TextField control={c} name="occupation" label="Occupation" placeholder="Student, Engineer…" />
          <TextField control={c} name="institution" label="University / employer" />
          <TextField control={c} name="expectedLeavingDate" label="Expected leaving date" type="date" />
        </FormGrid>
        <SubHeading>Emergency & guardian</SubHeading>
        <FormGrid>
          <TextField control={c} name="emergencyContactName" label="Emergency contact name" />
          <TextField control={c} name="emergencyContactPhone" label="Emergency contact phone" type="tel" inputMode="tel" />
          <TextField control={c} name="emergencyContactRelation" label="Relation" placeholder="Father, Sister…" />
          <TextField control={c} name="guardianName" label="Guardian name" />
          <TextField control={c} name="guardianPhone" label="Guardian phone" type="tel" inputMode="tel" />
        </FormGrid>
        <TextareaField control={c} name="notes" label="Internal notes" rows={3} />
      </MoreDetails>

      <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-2 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <SubmitButton pending={pending} className="flex-1 sm:flex-none">
          {residentId ? "Save changes" : returnTo?.kind === "check-in" ? "Save & continue check-in" : "Add resident"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Photo picker: uploads immediately (purpose "resident-photo"), the form submits the file id. */
function PhotoField({ control, name }: { control: Control<ResidentInput, unknown, ResidentValues>; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Controller
      control={control}
      name="photoFileId"
      render={({ field }) => (
        <div className="flex items-center gap-4">
          <ResidentAvatar name={name.trim() || "?"} photoFileId={field.value || null} size="xl" />
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                try {
                  const uploaded = await uploadFile(file, "resident-photo");
                  field.onChange(uploaded.id);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setBusy(false);
                  if (input.current) input.current.value = "";
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Spinner /> : <Camera />}
              {field.value ? "Change photo" : "Upload photo"}
            </Button>
            {field.value ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange("")} disabled={busy}>
                <Trash2 />
                Remove
              </Button>
            ) : null}
            <p className="w-full text-xs text-muted-foreground">JPG, PNG or WebP · up to 10 MB</p>
          </div>
        </div>
      )}
    />
  );
}
