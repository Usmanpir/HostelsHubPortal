"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormGrid, FormSection, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { useTerms } from "@/components/shared/org-context";
import { ownerSchema, type OwnerInput } from "@/lib/validation/owners";
import { createOwnerAction, updateOwnerAction } from "@/app/(app)/owners/actions";

export function OwnerForm({ ownerId, initial }: { ownerId?: string; initial?: Partial<OwnerInput> }) {
  const router = useRouter();
  const terms = useTerms();
  const { form, onSubmit, pending } = useActionForm({
    schema: ownerSchema,
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      idNumber: "",
      address: "",
      bankName: "",
      bankAccountTitle: "",
      bankAccountNumber: "",
      commissionPercent: 0,
      notes: "",
      ...initial,
    },
    action: (values) => (ownerId ? updateOwnerAction(ownerId, values) : createOwnerAction(values)),
    onSuccess: (data) => {
      router.push(`/owners/${(data as { id: string }).id}`);
      router.refresh();
    },
  });
  const c = form.control;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection title="Owner" description="The landlord whose properties you manage.">
        <FormGrid>
          <TextField control={c} name="name" label="Full name" required placeholder="Tariq Mehmood" autoComplete="off" />
          <TextField control={c} name="phone" label="Phone" type="tel" placeholder="+92 300 1234567" />
          <TextField control={c} name="email" label="Email" type="email" />
          <TextField control={c} name="idNumber" label="CNIC / ID number" />
        </FormGrid>
        <TextField control={c} name="address" label="Address" />
      </FormSection>

      <FormSection
        title="Management fee"
        description={`Default % of rent collected that you keep. A ${terms.property.toLowerCase()} can override it with its own rate.`}
      >
        <FormGrid>
          <TextField
            control={c}
            name="commissionPercent"
            label="Default commission (%)"
            type="number"
            inputMode="decimal"
            description="0–100, up to two decimals."
          />
        </FormGrid>
      </FormSection>

      <FormSection title="Bank details" description="Printed on statements so payouts go to the right account.">
        <FormGrid>
          <TextField control={c} name="bankName" label="Bank" placeholder="Meezan Bank" />
          <TextField control={c} name="bankAccountTitle" label="Account title" />
          <TextField control={c} name="bankAccountNumber" label="Account number / IBAN" className="sm:col-span-2" />
        </FormGrid>
      </FormSection>

      <FormSection title="Notes">
        <TextareaField control={c} name="notes" label="Internal notes" rows={3} placeholder="Agreement terms, payout preferences…" />
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{ownerId ? "Save changes" : "Add owner"}</SubmitButton>
      </div>
    </form>
  );
}
