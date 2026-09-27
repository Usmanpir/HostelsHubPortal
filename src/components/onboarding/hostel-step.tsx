"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { FormGrid, MoneyField, SelectField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { hostelGenderLabels, hostelTypeLabels, optionsFrom } from "@/config/labels";
import { hostelSchema, type HostelInput } from "@/lib/validation/property";
import { saveHostelAction } from "@/app/onboarding/actions";
import type { OnboardingHostel } from "./types";
import { StepCard, StepFooter } from "./wizard-chrome";

/** "Sunrise Boys Hostel" → "SBH-01", "Sunrise" → "SUNR-01". */
export function suggestHostelCode(name: string) {
  const words = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.length === 1 ? words[0]!.slice(0, 4) : words.map((w) => w[0]).join("").slice(0, 5);
  const base = letters.toUpperCase();
  return base.length >= 2 ? `${base}-01` : `${base}H-01`;
}

function toFormValues(hostel: OnboardingHostel | null, defaults: { city?: string | null; country?: string | null }): HostelInput {
  if (!hostel) {
    return {
      name: "",
      code: "",
      type: "OTHER",
      gender: "MIXED",
      status: "ACTIVE",
      city: defaults.city ?? "",
      country: defaults.country ?? "",
      rentDueDay: 5,
      lateFeeGraceDays: 5,
    };
  }
  // Keep every stored field so saving this step never blanks out other settings.
  return {
    name: hostel.name,
    code: hostel.code,
    type: hostel.type,
    gender: hostel.gender,
    status: hostel.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    city: hostel.city ?? "",
    country: hostel.country ?? "",
    address: hostel.address ?? "",
    phone: hostel.phone ?? "",
    email: hostel.email ?? "",
    description: hostel.description ?? "",
    amenities: hostel.amenities,
    rules: hostel.rules ?? "",
    managerStaffId: hostel.managerStaffId ?? "",
    defaultBedRent: hostel.defaultBedRent ?? undefined,
    defaultDeposit: hostel.defaultDeposit ?? undefined,
    admissionFee: hostel.admissionFee ?? undefined,
    rentDueDay: hostel.rentDueDay,
    lateFeeAmount: hostel.lateFeeAmount ?? undefined,
    lateFeeGraceDays: hostel.lateFeeGraceDays,
  };
}

export function HostelStep({
  hostel,
  currency,
  orgCity,
  orgCountry,
}: {
  hostel: OnboardingHostel | null;
  currency: string;
  orgCity: string | null;
  orgCountry: string | null;
}) {
  const router = useRouter();
  const codeTouched = useRef(!!hostel);
  const { form, onSubmit, pending } = useActionForm({
    schema: hostelSchema,
    defaultValues: toFormValues(hostel, { city: orgCity, country: orgCountry }),
    action: (values) => saveHostelAction(hostel?.id ?? null, values),
    successMessage: hostel ? "Hostel updated" : "Hostel created",
    onSuccess: () => router.push("/onboarding?step=3"),
  });
  const c = form.control;

  return (
    <StepCard
      eyebrow="Step 2"
      title={hostel ? "Your first hostel" : "Add your first hostel"}
      description="You can add more properties later from the Hostels page."
    >
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-6"
        noValidate
        onChange={(e) => {
          const target = e.target;
          if (!(target instanceof HTMLInputElement)) return;
          if (target.name === "code") codeTouched.current = true;
          if (target.name === "name" && !codeTouched.current) {
            form.setValue("code", suggestHostelCode(target.value), { shouldValidate: form.formState.isSubmitted });
          }
        }}
      >
        <FormGrid>
          <TextField control={c} name="name" label="Hostel name" required placeholder="Sunrise Boys Hostel" />
          <TextField
            control={c}
            name="code"
            label="Short code"
            required
            placeholder="SBH-01"
            description="Used on invoices and reports. Letters, numbers and dashes."
          />
          <SelectField control={c} name="type" label="Hostel type" options={optionsFrom(hostelTypeLabels)} />
          <SelectField control={c} name="gender" label="Residents" options={optionsFrom(hostelGenderLabels)} />
          <TextField control={c} name="city" label="City" />
          <TextField control={c} name="country" label="Country" />
          <MoneyField control={c} name="defaultBedRent" label="Default monthly rent per bed" currency={currency} />
          <MoneyField control={c} name="defaultDeposit" label="Default security deposit" currency={currency} />
        </FormGrid>
        <p className="text-xs text-muted-foreground">
          Defaults are suggested when checking residents in and can be overridden per room or bed.
        </p>
        <StepFooter step={2}>
          <SubmitButton pending={pending} className="h-9 px-4">
            {hostel ? "Save and continue" : "Create hostel"}
            <ArrowRight />
          </SubmitButton>
        </StepFooter>
      </form>
    </StepCard>
  );
}
