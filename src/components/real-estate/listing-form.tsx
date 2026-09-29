"use client";

import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormGrid, FormSection, MoneyField, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { useFormatters, useTerms } from "@/components/shared/org-context";
import { optionsFrom } from "@/config/labels";
import { areaUnitOptions, listingPropertyTypeLabels, listingPurposeLabels } from "@/config/real-estate-labels";
import type { AreaUnit } from "@/generated/prisma/enums";
import { listingSchema, type ListingInput } from "@/lib/validation/real-estate";
import { createListingAction, updateListingAction } from "@/app/(app)/listings/actions";
import { ChipsField } from "./chips-field";

export type ListingFormOptions = {
  properties: { id: string; name: string; city: string | null; address: string | null; units: { id: string; roomNumber: string }[] }[];
  owners: { id: string; name: string; ownerCode: string }[];
  agents: { id: string; name: string }[];
};

const FEATURE_SUGGESTIONS = [
  "Parking",
  "Corner",
  "Park facing",
  "Gas",
  "Electricity backup",
  "Water supply",
  "Lift",
  "Security",
  "Servant quarter",
  "Lawn",
  "Air conditioning",
  "Near mosque",
  "Near school",
];

export function ListingForm({
  listingId,
  initial,
  options,
  purposeLocked,
}: {
  listingId?: string;
  initial?: Partial<ListingInput>;
  options: ListingFormOptions;
  /** Sold / rented listings keep their purpose. */
  purposeLocked?: boolean;
}) {
  const router = useRouter();
  const terms = useTerms();
  const { currency } = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: listingSchema,
    defaultValues: {
      title: "",
      purpose: "SALE",
      propertyType: "HOUSE",
      priceNegotiable: false,
      furnished: false,
      features: [],
      areaUnit: currency.toUpperCase() === "PKR" ? "MARLA" : "SQFT",
      ...initial,
    },
    action: (values) => (listingId ? updateListingAction(listingId, values) : createListingAction(values)),
    onSuccess: (data) => {
      router.push(`/listings/${(data as { id: string }).id}`);
      router.refresh();
    },
  });
  const c = form.control;
  const hostelId = useWatch({ control: c, name: "hostelId" });
  const areaUnit = useWatch({ control: c, name: "areaUnit" }) as AreaUnit | "" | undefined;
  const property = options.properties.find((p) => p.id === hostelId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection title="Basics" description="What is being offered and at what price.">
        <TextField control={c} name="title" label="Title" required placeholder="10 Marla house with basement, DHA Phase 5" />
        <FormGrid>
          <SelectField control={c} name="purpose" label="Purpose" required options={optionsFrom(listingPurposeLabels)} disabled={purposeLocked} />
          <SelectField control={c} name="propertyType" label="Property type" required options={optionsFrom(listingPropertyTypeLabels)} />
          <MoneyField control={c} name="price" label="Price" required currency={currency} description="Monthly rent for rentals." />
          <SwitchField control={c} name="priceNegotiable" label="Price negotiable" />
        </FormGrid>
      </FormSection>

      <FormSection title="Size & layout">
        <FormGrid>
          <TextField control={c} name="areaValue" label="Area" type="number" inputMode="decimal" placeholder="5" />
          <SelectField control={c} name="areaUnit" label="Area unit" options={areaUnitOptions(currency, areaUnit || null)} />
          <TextField control={c} name="bedrooms" label="Bedrooms" type="number" inputMode="numeric" />
          <TextField control={c} name="bathrooms" label="Bathrooms" type="number" inputMode="numeric" />
        </FormGrid>
        <SwitchField control={c} name="furnished" label="Furnished" />
      </FormSection>

      <FormSection title="Location">
        <TextField control={c} name="address" label="Address" placeholder="House 12, Street 4" />
        <FormGrid>
          <TextField control={c} name="locality" label="Area / locality" placeholder="DHA Phase 6" />
          <TextField control={c} name="city" label="City" placeholder="Lahore" />
        </FormGrid>
      </FormSection>

      <FormSection title="Description & features">
        <TextareaField control={c} name="description" label="Description" rows={5} placeholder="Highlights, nearby landmarks, possession, documents…" />
        <ChipsField control={c} name="features" label="Features" suggestions={FEATURE_SUGGESTIONS} />
      </FormSection>

      <FormSection title="Links & agent" description={`Optionally link a managed ${terms.property.toLowerCase()} or ${terms.unit.toLowerCase()} and the owner.`}>
        <FormGrid>
          <SelectField
            control={c}
            name="hostelId"
            label={`Managed ${terms.property.toLowerCase()}`}
            allowEmpty="Not linked"
            options={options.properties.map((p) => ({ value: p.id, label: p.city ? `${p.name} · ${p.city}` : p.name }))}
            onValueChange={(value) => {
              form.setValue("roomId", "");
              const p = options.properties.find((x) => x.id === value);
              if (p?.city && !form.getValues("city")) form.setValue("city", p.city);
              if (p?.address && !form.getValues("address")) form.setValue("address", p.address);
            }}
          />
          <SelectField
            control={c}
            name="roomId"
            label={terms.unit}
            allowEmpty={property ? `Whole ${terms.property.toLowerCase()}` : `Select a ${terms.property.toLowerCase()} first`}
            disabled={!property}
            options={(property?.units ?? []).map((u) => ({ value: u.id, label: `${terms.unit} ${u.roomNumber}` }))}
          />
          <SelectField
            control={c}
            name="ownerId"
            label="Owner"
            allowEmpty="No owner"
            options={options.owners.map((o) => ({ value: o.id, label: `${o.name} (${o.ownerCode})` }))}
          />
          <SelectField control={c} name="agentUserId" label="Agent" allowEmpty="Unassigned" options={options.agents.map((a) => ({ value: a.id, label: a.name }))} />
        </FormGrid>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{listingId ? "Save changes" : "Create listing"}</SubmitButton>
      </div>
    </form>
  );
}
