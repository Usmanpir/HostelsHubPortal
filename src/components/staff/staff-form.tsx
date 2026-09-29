"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { FormGrid, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { MoreDetails } from "@/components/forms/more-details";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { useFormatters } from "@/components/shared/org-context";
import { employmentTypeLabels, optionsFrom, staffStatusLabels, staffTypeLabels } from "@/config/labels";
import { staffSchema, type StaffInput } from "@/lib/validation/staff";
import { cn } from "@/lib/utils";
import { createStaffAction, updateStaffAction } from "@/app/(app)/staff/actions";
import { StaffAvatar } from "./staff-avatar";

/** Optional fields shown under "More details" (opened automatically on errors). */
const MORE_FIELDS = [
  "email",
  "idNumber",
  "address",
  "dateOfBirth",
  "department",
  "employmentType",
  "status",
  "userId",
  "notes",
  "photoFileId",
] as const satisfies readonly (keyof StaffInput)[];

export type LinkableMember = { userId: string; name: string; email: string; roleName: string };

export function StaffForm({
  staffId,
  initial,
  hostels,
  members,
  canSetSalary,
  currentPhotoFileId,
  displayName,
}: {
  staffId?: string;
  initial?: Partial<StaffInput>;
  hostels: { id: string; name: string; code: string }[];
  members: LinkableMember[];
  canSetSalary: boolean;
  currentPhotoFileId?: string | null;
  displayName?: string;
}) {
  const router = useRouter();
  const { currency } = useFormatters();
  const [photo, setPhoto] = useState<UploadedFile | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  const { form, onSubmit, pending } = useActionForm({
    schema: staffSchema,
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      idNumber: "",
      address: "",
      dateOfBirth: "",
      joiningDate: "",
      designation: "OTHER",
      department: "",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
      salary: 0,
      notes: "",
      hostelIds: hostels.length === 1 ? [hostels[0]!.id] : [],
      primaryHostelId: hostels.length === 1 ? hostels[0]!.id : "",
      userId: "",
      photoFileId: "",
      removePhoto: false,
      ...initial,
    },
    action: (values) => (staffId ? updateStaffAction(staffId, values) : createStaffAction(values)),
    onSuccess: (data) => {
      router.push(`/staff/${(data as { id: string }).id}`);
      router.refresh();
    },
  });
  const c = form.control;
  const shownPhotoId = photoRemoved ? null : currentPhotoFileId;
  // A single hostel is pre-assigned; only show the picker when there's a choice to make.
  const defaultHostelIds = initial?.hostelIds ?? (hostels.length === 1 ? [hostels[0]!.id] : []);
  const showHostels = hostels.length !== 1 || !defaultHostelIds.includes(hostels[0]!.id);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormGrid>
        <TextField control={c} name="firstName" label="First name" required autoComplete="off" />
        <TextField control={c} name="lastName" label="Last name" required autoComplete="off" />
        <TextField control={c} name="phone" label="Phone" type="tel" required inputMode="tel" />
        <SelectField control={c} name="designation" label="Designation" required options={optionsFrom(staffTypeLabels)} />
        <TextField control={c} name="joiningDate" label="Joining date" type="date" required />
        {canSetSalary ? <MoneyField control={c} name="salary" label="Monthly salary" currency={currency} /> : null}
      </FormGrid>

      {showHostels ? (
        <Controller
          control={c}
          name="hostelIds"
          render={({ field, fieldState }) => {
            const selected = (field.value as string[] | undefined) ?? [];
            const primary = form.watch("primaryHostelId") as string | undefined;
            const toggle = (id: string, on: boolean) => {
              const next = on ? [...selected, id] : selected.filter((h) => h !== id);
              field.onChange(next);
              if (on && !primary) form.setValue("primaryHostelId", id);
              if (!on && primary === id) form.setValue("primaryHostelId", next[0] ?? "");
            };
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>
                  Assigned hostels<span className="text-destructive">*</span>
                </FieldLabel>
                {hostels.length === 0 ? (
                  <FieldDescription>No active hostels available. Create a hostel first.</FieldDescription>
                ) : (
                  <ul className="divide-y overflow-hidden rounded-lg border">
                    {hostels.map((h) => {
                      const checked = selected.includes(h.id);
                      const isPrimary = checked && primary === h.id;
                      return (
                        <li key={h.id} className={cn("flex items-center gap-3 px-3 py-2.5", checked && "bg-accent/30")}>
                          <Checkbox
                            id={`hostel-${h.id}`}
                            checked={checked}
                            onCheckedChange={(v) => toggle(h.id, v === true)}
                            aria-label={h.name}
                          />
                          <label htmlFor={`hostel-${h.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                            <span className="font-medium">{h.name}</span>
                            <span className="ms-2 font-mono text-xs text-muted-foreground">{h.code}</span>
                          </label>
                          {checked ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={isPrimary ? "secondary" : "ghost"}
                              onClick={() => form.setValue("primaryHostelId", h.id, { shouldValidate: true })}
                              aria-pressed={isPrimary}
                            >
                              <Star className={cn(isPrimary && "fill-current text-warning")} />
                              {isPrimary ? "Primary" : "Make primary"}
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <FieldError errors={[fieldState.error, form.formState.errors.primaryHostelId]} />
              </Field>
            );
          }}
        />
      ) : null}

      <MoreDetails errors={form.formState.errors} fields={MORE_FIELDS} hint="Photo, email, CNIC, address, employment type, status, app account, notes">
        <div className="flex items-center gap-4">
          <StaffAvatar name={displayName || "New staff"} photoFileId={photo ? photo.id : shownPhotoId} size="lg" className="size-14" />
          <div className="min-w-0 flex-1">
            {photo || !shownPhotoId ? (
              <FileUpload
                purpose="staff-photo"
                kind="image"
                value={photo}
                label="Upload photo"
                hint="JPG, PNG or WebP"
                onChange={(file) => {
                  setPhoto(file);
                  form.setValue("photoFileId", file?.id ?? "");
                }}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhotoRemoved(true);
                    form.setValue("removePhoto", true);
                  }}
                >
                  <Trash2 />
                  Remove photo
                </Button>
              </div>
            )}
          </div>
        </div>
        <FormGrid>
          <TextField control={c} name="email" label="Email" type="email" />
          <TextField control={c} name="idNumber" label="CNIC / ID number" />
          <TextField control={c} name="dateOfBirth" label="Date of birth" type="date" />
          <TextField control={c} name="department" label="Department" placeholder="Housekeeping" />
          <SelectField control={c} name="employmentType" label="Employment type" options={optionsFrom(employmentTypeLabels)} />
          <SelectField control={c} name="status" label="Status" options={optionsFrom(staffStatusLabels)} />
          <TextField control={c} name="address" label="Address" className="sm:col-span-2" />
        </FormGrid>
        <SelectField
          control={c}
          name="userId"
          label="Linked account"
          allowEmpty="Not linked"
          options={members.map((m) => ({ value: m.userId, label: `${m.name} · ${m.email} (${m.roleName})` }))}
          description={members.length === 0 ? "All active team members are already linked to staff records." : "Lets them see their own tasks and request leave."}
        />
        <TextareaField control={c} name="notes" label="Internal notes" rows={3} />
      </MoreDetails>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{staffId ? "Save changes" : "Add staff member"}</SubmitButton>
      </div>
    </form>
  );
}
