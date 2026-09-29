"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormGrid, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { MoreDetails, SubHeading } from "@/components/forms/more-details";
import { useFormatters } from "@/components/shared/org-context";
import { hostelGenderLabels, hostelTypeLabels, optionsFrom } from "@/config/labels";
import { hostelSchema, type HostelInput } from "@/lib/validation/property";
import { createHostelAction, updateHostelAction } from "@/app/(app)/hostels/actions";

export type HostelFormValues = HostelInput & { amenities?: string | string[] };

/** Optional fields shown under "More details" (opened automatically on errors). */
const MORE_FIELDS = [
  "gender",
  "status",
  "managerStaffId",
  "description",
  "address",
  "country",
  "phone",
  "email",
  "defaultDeposit",
  "admissionFee",
  "rentDueDay",
  "lateFeeAmount",
  "lateFeeGraceDays",
  "amenities",
  "rules",
] as const satisfies readonly (keyof HostelFormValues)[];

export function HostelForm({
  hostelId,
  initial,
  managers,
}: {
  hostelId?: string;
  initial?: Partial<HostelFormValues>;
  managers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { currency } = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: hostelSchema,
    defaultValues: {
      name: "",
      code: "",
      type: "OTHER",
      gender: "MIXED",
      status: "ACTIVE",
      rentDueDay: 5,
      lateFeeGraceDays: 5,
      ...initial,
      amenities: Array.isArray(initial?.amenities) ? initial.amenities.join(", ") : (initial?.amenities ?? ""),
    },
    action: (values) => (hostelId ? updateHostelAction(hostelId, values) : createHostelAction(values)),
    onSuccess: (data) => {
      router.push(`/hostels/${(data as { id: string }).id}`);
      router.refresh();
    },
  });
  const c = form.control;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormGrid>
        <TextField control={c} name="name" label="Hostel name" required placeholder="Islamabad Boys Hostel" />
        <TextField control={c} name="code" label="Code" required placeholder="ISB-01" description="Short code used on invoices." />
        <SelectField control={c} name="type" label="Type" options={optionsFrom(hostelTypeLabels)} />
        <TextField control={c} name="city" label="City" />
        <MoneyField control={c} name="defaultBedRent" label="Default monthly bed rent" currency={currency} />
      </FormGrid>

      <MoreDetails errors={form.formState.errors} fields={MORE_FIELDS} hint="Address & contact, deposit, fees, due day, amenities, rules, manager">
        <SubHeading>Property</SubHeading>
        <FormGrid>
          <SelectField control={c} name="gender" label="Residents" options={optionsFrom(hostelGenderLabels)} />
          <SelectField
            control={c}
            name="status"
            label="Status"
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
          />
          <SelectField
            control={c}
            name="managerStaffId"
            label="Manager"
            allowEmpty="No manager"
            options={managers.map((m) => ({ value: m.id, label: m.name }))}
          />
        </FormGrid>
        <TextareaField control={c} name="description" label="Description" rows={3} />
        <SubHeading>Location & contact</SubHeading>
        <TextField control={c} name="address" label="Address" />
        <FormGrid>
          <TextField control={c} name="country" label="Country" />
          <TextField control={c} name="phone" label="Phone" type="tel" />
          <TextField control={c} name="email" label="Email" type="email" />
        </FormGrid>
        <SubHeading>Billing defaults</SubHeading>
        <FormGrid>
          <MoneyField control={c} name="defaultDeposit" label="Default security deposit" currency={currency} />
          <MoneyField control={c} name="admissionFee" label="Admission fee" currency={currency} />
          <TextField control={c} name="rentDueDay" label="Rent due day of month" type="number" description="1–28" />
          <MoneyField control={c} name="lateFeeAmount" label="Late fee" currency={currency} />
          <TextField control={c} name="lateFeeGraceDays" label="Late fee grace period (days)" type="number" />
        </FormGrid>
        <SubHeading>Amenities & rules</SubHeading>
        <TextField control={c} name="amenities" label="Amenities" placeholder="Wi-Fi, Laundry, Mess, Parking" description="Separate with commas." />
        <TextareaField control={c} name="rules" label="House rules" rows={5} placeholder="Gate closes at 11 PM…" />
      </MoreDetails>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{hostelId ? "Save changes" : "Create hostel"}</SubmitButton>
      </div>
    </form>
  );
}
