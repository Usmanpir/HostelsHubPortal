"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { FormGrid, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters } from "@/components/shared/org-context";
import { optionsFrom, paymentMethodLabels } from "@/config/labels";
import { refundSchema } from "@/lib/validation/finance";
import { recordRefundAction } from "@/app/(app)/finance/actions";
import { ResidentPicker, type ResidentPickerOption } from "./resident-picker";

/** Record money paid back to a resident (deposit refund, overpayment…). */
export function RefundDialog({ trigger, today }: { trigger: React.ReactNode; today: string }) {
  const [open, setOpen] = useState(false);
  const [resident, setResident] = useState<ResidentPickerOption | null>(null);
  const router = useRouter();
  const fmt = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: refundSchema,
    defaultValues: { residentId: "", amount: "", method: "CASH", reference: "", paymentDate: today, notes: "" },
    action: recordRefundAction,
    successMessage: (data) => `Refund recorded · ${data.receiptNumber}`,
    onSuccess: (data) => {
      setOpen(false);
      form.reset();
      setResident(null);
      router.push(`/finance/payments/${data.id}`);
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !pending && setOpen(o)}
      trigger={trigger}
      title="Record refund"
      description="Money paid back to a resident, such as a security deposit. Refunds reduce cash collected."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field data-invalid={!!form.formState.errors.residentId}>
          <FieldLabel htmlFor="refund-resident">
            Resident<span className="text-destructive">*</span>
          </FieldLabel>
          <ResidentPicker
            id="refund-resident"
            value={resident}
            onChange={(o) => {
              setResident(o);
              form.setValue("residentId", o?.id ?? "", { shouldValidate: true });
            }}
            invalid={!!form.formState.errors.residentId}
          />
          <FieldError errors={[form.formState.errors.residentId ? { message: "Select a resident" } : undefined]} />
        </Field>
        <FormGrid>
          <MoneyField control={c} name="amount" label="Amount" required currency={fmt.currency} />
          <TextField control={c} name="paymentDate" label="Date" type="date" required />
          <SelectField control={c} name="method" label="Method" required options={optionsFrom(paymentMethodLabels)} />
          <TextField control={c} name="reference" label="Reference" />
        </FormGrid>
        <TextareaField control={c} name="notes" label="Notes" rows={2} placeholder="e.g. Security deposit refund on check-out" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Record refund</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
