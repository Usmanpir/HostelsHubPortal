"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormGrid, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { MoreDetails, SubHeading } from "@/components/forms/more-details";
import { useFormatters, useOrg, useTerms } from "@/components/shared/org-context";
import { hostelGenderLabels, hostelTypeLabels, optionsFrom } from "@/config/labels";
import { hostelSchema, type HostelInput } from "@/lib/validation/property";
import { defaultRentalMode, PROPERTY_KIND_LABELS, RENTAL_MODE_LABELS } from "@/lib/terms";
import type { PropertyKind } from "@/generated/prisma/enums";
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
  "ownerId",
  "managementFeePercent",
  "amenities",
  "rules",
] as const satisfies readonly (keyof HostelFormValues)[];

export function HostelForm({
  hostelId,
  initial,
  managers,
  owners = [],
}: {
  hostelId?: string;
  initial?: Partial<HostelFormValues>;
  managers: { id: string; name: string }[];
  /** Property owners (only passed when the Owners module is on). */
  owners?: { id: string; name: string; commissionPercent?: number }[];
}) {
  const router = useRouter();
  const { currency } = useFormatters();
  const t = useTerms();
  const org = useOrg();
  const ownersEnabled = !!org.modules?.owners;
  const isHostelOrg = !org.businessType || org.businessType === "HOSTELS";
  const initialKind: PropertyKind = initial?.kind ?? (isHostelOrg ? "HOSTEL" : "APARTMENT_BUILDING");
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
      kind: initialKind,
      rentalMode: defaultRentalMode(initialKind),
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
  const wholeUnit = form.watch("rentalMode") === "WHOLE_UNIT";
  const ownerId = form.watch("ownerId");
  const ownerFee = owners.find((o) => o.id === ownerId)?.commissionPercent;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormGrid>
        <TextField
          control={c}
          name="name"
          label={`${t.property} name`}
          required
          placeholder={isHostelOrg ? "Islamabad Boys Hostel" : "Blue Area Apartments"}
        />
        <TextField control={c} name="code" label="Code" required placeholder="ISB-01" description="Short code used on invoices." />
        <SelectField
          control={c}
          name="kind"
          label="Property type"
          options={optionsFrom(PROPERTY_KIND_LABELS)}
          onValueChange={(v) => {
            if (v) form.setValue("rentalMode", defaultRentalMode(v as PropertyKind), { shouldDirty: true });
          }}
        />
        <SelectField
          control={c}
          name="rentalMode"
          label="Rental mode"
          options={optionsFrom(RENTAL_MODE_LABELS)}
          description={wholeUnit ? "Each unit is leased to one tenant." : "Rooms hold beds rented individually."}
        />
        {wholeUnit ? null : <SelectField control={c} name="type" label="Type" options={optionsFrom(hostelTypeLabels)} />}
        <TextField control={c} name="city" label="City" />
        <MoneyField
          control={c}
          name="defaultBedRent"
          label={wholeUnit ? "Default monthly unit rent" : "Default monthly bed rent"}
          currency={currency}
        />
      </FormGrid>

      {ownersEnabled ? (
        <FormGrid>
          <SelectField
            control={c}
            name="ownerId"
            label="Owner"
            allowEmpty="Managed for ourselves (no owner)"
            options={owners.map((o) => ({ value: o.id, label: o.name }))}
            description={owners.length ? undefined : "Add owners under Owners to assign one."}
          />
          <TextField
            control={c}
            name="managementFeePercent"
            label="Management fee %"
            type="number"
            inputMode="decimal"
            placeholder={ownerFee !== undefined ? String(ownerFee) : "0"}
            description={
              ownerFee !== undefined ? `Leave empty to use the owner's default (${ownerFee}%).` : "Share of rent collected kept as your fee."
            }
          />
        </FormGrid>
      ) : null}

      <MoreDetails errors={form.formState.errors} fields={MORE_FIELDS} hint="Address & contact, deposit, fees, due day, amenities, rules, manager">
        <SubHeading>Property</SubHeading>
        <FormGrid>
          {wholeUnit ? null : (
            <SelectField control={c} name="gender" label={t.residents} options={optionsFrom(hostelGenderLabels)} />
          )}
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
          {wholeUnit ? null : <MoneyField control={c} name="admissionFee" label="Admission fee" currency={currency} />}
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
        <SubmitButton pending={pending}>{hostelId ? "Save changes" : `Create ${t.property.toLowerCase()}`}</SubmitButton>
      </div>
    </form>
  );
}
