"use client";

import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormGrid, FormSection, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { useFormatters } from "@/components/shared/org-context";
import { invoiceSettingsSchema, type InvoiceSettingsInput } from "@/lib/validation/settings";
import { updateInvoiceSettingsAction } from "@/app/(app)/settings/actions";

const clean = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^[A-Z0-9-]{1,10}$/.test(s) ? s : fallback;
};

export function InvoiceSettingsForm({ initial }: { initial: InvoiceSettingsInput }) {
  const router = useRouter();
  const { money } = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: invoiceSettingsSchema,
    defaultValues: initial,
    action: (values) => updateInvoiceSettingsAction(values),
    onSuccess: () => {
      form.reset(form.getValues());
      router.refresh();
    },
  });
  const c = form.control;
  const [invoicePrefix, receiptPrefix, invoiceDueDays, taxRate, taxLabel, invoiceFooter] = useWatch({
    control: c,
    name: ["invoicePrefix", "receiptPrefix", "invoiceDueDays", "taxRate", "taxLabel", "invoiceFooter"],
  });

  const rate = Math.min(Math.max(Number(taxRate) || 0, 0), 100);
  const subtotal = 10000;
  const tax = Math.round(subtotal * rate) / 100;
  const days = Math.max(0, Math.floor(Number(invoiceDueDays) || 0));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
        <FormSection title="Numbering" description="Prefixes for invoice and receipt numbers. The running counter is never reset.">
          <FormGrid>
            <TextField control={c} name="invoicePrefix" label="Invoice prefix" required placeholder="INV" />
            <TextField control={c} name="receiptPrefix" label="Receipt prefix" required placeholder="RCP" />
          </FormGrid>
        </FormSection>

        <FormSection title="Payment terms" description="Default due date for new invoices, counted from the issue date.">
          <TextField
            control={c}
            name="invoiceDueDays"
            label="Due after (days)"
            type="number"
            inputMode="numeric"
            description="Use 0 for invoices due on the day they're issued."
            className="sm:max-w-60"
          />
        </FormSection>

        <FormSection title="Tax" description="Applied to invoices when “apply tax” is selected.">
          <FormGrid>
            <TextField control={c} name="taxRate" label="Tax rate (%)" type="number" inputMode="decimal" description="Between 0 and 100." />
            <TextField control={c} name="taxLabel" label="Tax label" placeholder="GST" description="Shown on invoice totals." />
          </FormGrid>
        </FormSection>

        <FormSection title="Footer" description="Printed at the bottom of every invoice — bank details, terms or a thank-you note.">
          <TextareaField control={c} name="invoiceFooter" label="Invoice footer" rows={4} placeholder="Bank: … · Account: … · Thank you for staying with us." />
        </FormSection>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending || !form.formState.isDirty} onClick={() => form.reset()}>
            Discard changes
          </Button>
          <SubmitButton pending={pending}>Save changes</SubmitButton>
        </div>
      </form>

      <aside className="h-fit rounded-xl border bg-card p-4 xl:sticky xl:top-20" aria-label="Invoice preview">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
        <div className="mt-3 flex flex-col gap-3 rounded-lg border bg-background p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Invoice</span>
            <span className="font-mono text-xs">{clean(invoicePrefix, "INV")}-00042</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Due {days === 0 ? "on issue" : `${days} day${days === 1 ? "" : "s"} after issue`}
          </p>
          <dl className="grid gap-1 border-t pt-3 tabular">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {(typeof taxLabel === "string" && taxLabel.trim()) || "Tax"} ({rate}%)
              </dt>
              <dd>{money(tax)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>Total</dt>
              <dd>{money(subtotal + tax)}</dd>
            </div>
          </dl>
          {typeof invoiceFooter === "string" && invoiceFooter.trim() ? (
            <p className="border-t pt-3 text-xs whitespace-pre-line text-muted-foreground">{invoiceFooter}</p>
          ) : null}
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Receipts: <span className="font-mono">{clean(receiptPrefix, "RCP")}-00017</span>
          </p>
        </div>
      </aside>
    </div>
  );
}
