"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { CalendarDays, Link2, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { FormGrid, FormSection, MoneyField, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { useFormatters } from "@/components/shared/org-context";
import { chargeTypeLabels, optionsFrom } from "@/config/labels";
import { invoiceSchema, type InvoiceInput } from "@/lib/validation/finance";
import { computeInvoiceTotals, lineAmount } from "@/services/finance/totals";
import type { ResidentBillingContext } from "@/services/finance/billing-residents";
import { createInvoiceAction, residentBillingContextAction, updateInvoiceAction } from "@/app/(app)/finance/actions";
import { ResidentPicker, type ResidentPickerOption } from "./resident-picker";

const NO_STAY = "__none__";
const chargeOptions = optionsFrom(chargeTypeLabels);

function monthRange(base: string, offset: number) {
  const [y, m] = base.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(y, m + offset, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return new Date(d.getTime() + days * 86400_000).toISOString().slice(0, 10);
}

export type InvoiceFormProps = {
  invoiceId?: string;
  /** Current status when editing (drafts can still be saved as draft). */
  currentStatus?: "DRAFT" | "PENDING" | "OVERDUE";
  initial?: Partial<InvoiceInput>;
  initialResident?: ResidentPickerOption | null;
  taxRate: number;
  taxLabel: string;
  invoiceDueDays: number;
  today: string;
};

export function InvoiceForm(props: InvoiceFormProps) {
  const { invoiceId, taxRate, taxLabel, invoiceDueDays, today } = props;
  const editing = !!invoiceId;
  const router = useRouter();
  const fmt = useFormatters();
  const [resident, setResident] = useState<ResidentPickerOption | null>(props.initialResident ?? null);
  const [billing, setBilling] = useState<ResidentBillingContext | null>(null);
  const [loadingBilling, startBilling] = useTransition();
  const thisMonth = monthRange(today.slice(0, 7), 0);

  const { form, onSubmit, pending } = useActionForm({
    schema: invoiceSchema,
    defaultValues: {
      residentId: props.initialResident?.id ?? "",
      assignmentId: "",
      issueDate: today,
      dueDate: addDays(today, invoiceDueDays),
      periodStart: thisMonth.start,
      periodEnd: thisMonth.end,
      items: [{ type: "MONTHLY_RENT", description: chargeTypeLabels.MONTHLY_RENT, quantity: 1, unitPrice: 0 }],
      discount: 0,
      applyTax: taxRate > 0,
      notes: "",
      status: "PENDING",
      ...props.initial,
    },
    action: (values) => (invoiceId ? updateInvoiceAction(invoiceId, values) : createInvoiceAction(values)),
    successMessage: (data) => (data.status === "DRAFT" ? "Draft saved" : editing ? "Invoice updated" : "Invoice issued"),
    onSuccess: (data) => {
      router.push(`/finance/invoices/${data.id}`);
      router.refresh();
    },
  });
  const c = form.control;
  const { fields, append, remove } = useFieldArray({ control: c, name: "items" });
  const items = useWatch({ control: c, name: "items" });
  const discount = useWatch({ control: c, name: "discount" });
  const applyTax = useWatch({ control: c, name: "applyTax" });
  const assignmentId = useWatch({ control: c, name: "assignmentId" });
  const issueDate = useWatch({ control: c, name: "issueDate" });

  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        (items ?? []).map((i) => ({ quantity: Number(i?.quantity) || 0, unitPrice: Number(i?.unitPrice) || 0 })),
        Number(discount) || 0,
        applyTax ? taxRate : 0,
      ),
    [items, discount, applyTax, taxRate],
  );

  const loadBilling = useCallback(
    (residentId: string, { autoFill }: { autoFill: boolean }) => {
      startBilling(async () => {
        const result = await residentBillingContextAction(residentId);
        if (!result.ok) {
          toast.error(result.error);
          setBilling(null);
          return;
        }
        setBilling(result.data);
        if (!autoFill) return;
        const stay = result.data.activeAssignment;
        form.setValue("assignmentId", stay?.id ?? "", { shouldDirty: true });
        const first = form.getValues("items.0");
        if (stay && first && first.type === "MONTHLY_RENT" && !(Number(first.unitPrice) > 0)) {
          form.setValue("items.0.unitPrice", stay.monthlyRent, { shouldDirty: true });
        }
      });
    },
    [form],
  );

  // Prefill (?residentId=) and edit mode: load the resident's billing context once.
  useEffect(() => {
    if (props.initialResident) loadBilling(props.initialResident.id, { autoFill: !editing && !props.initial?.assignmentId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickResident = (option: ResidentPickerOption | null) => {
    setResident(option);
    form.setValue("residentId", option?.id ?? "", { shouldValidate: !!option, shouldDirty: true });
    form.setValue("assignmentId", "");
    setBilling(null);
    if (option) loadBilling(option.id, { autoFill: true });
  };

  const setPeriod = (offset: number) => {
    const r = monthRange(today.slice(0, 7), offset);
    form.setValue("periodStart", r.start, { shouldDirty: true });
    form.setValue("periodEnd", r.end, { shouldDirty: true, shouldValidate: true });
  };

  const submitAs = (status: "DRAFT" | "PENDING") => () => form.setValue("status", status);
  const itemErrors = form.formState.errors.items;
  const stay = billing?.activeAssignment ?? null;
  const allowDraft = !editing || props.currentStatus === "DRAFT";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6">
        <FormSection title="Resident" description="Who is being billed. The invoice is filed under their hostel.">
          <Field data-invalid={!!form.formState.errors.residentId}>
            <FieldLabel htmlFor="invoice-resident">
              Resident<span className="text-destructive">*</span>
            </FieldLabel>
            <ResidentPicker
              id="invoice-resident"
              value={resident}
              onChange={pickResident}
              disabled={editing}
              invalid={!!form.formState.errors.residentId}
            />
            <FieldError errors={[form.formState.errors.residentId]} />
          </Field>

          {resident ? (
            loadingBilling ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Loading billing details…
              </p>
            ) : billing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="invoice-stay">
                    <Link2 className="size-3.5" /> Linked stay
                  </FieldLabel>
                  <Select
                    value={assignmentId || NO_STAY}
                    onValueChange={(v) => form.setValue("assignmentId", v === NO_STAY ? "" : v, { shouldDirty: true })}
                  >
                    <SelectTrigger id="invoice-stay" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_STAY}>Not linked to a stay</SelectItem>
                      {stay ? <SelectItem value={stay.id}>{stay.label}</SelectItem> : null}
                      {assignmentId && assignmentId !== stay?.id ? <SelectItem value={assignmentId}>Previous stay</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <Wallet className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p>
                      Outstanding <span className="tabular font-medium">{fmt.money(billing.balance.outstanding)}</span>
                    </p>
                    {billing.balance.credit > 0 ? (
                      <p className="text-xs text-success">Credit available {fmt.money(billing.balance.credit)}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {stay ? `Monthly rent ${fmt.money(stay.monthlyRent)}` : "No active stay"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null
          ) : null}
        </FormSection>

        <FormSection title="Dates & period" description="Billing period is optional for one-off charges.">
          <FormGrid>
            <TextField control={c} name="issueDate" label="Issue date" type="date" required />
            <TextField
              control={c}
              name="dueDate"
              label="Due date"
              type="date"
              description={`Defaults to ${invoiceDueDays} days after issue.`}
            />
            <TextField control={c} name="periodStart" label="Period start" type="date" />
            <TextField control={c} name="periodEnd" label="Period end" type="date" />
          </FormGrid>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setPeriod(0)}>
              <CalendarDays /> This month
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPeriod(1)}>
              Next month
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                form.setValue("periodStart", "");
                form.setValue("periodEnd", "");
              }}
            >
              No period
            </Button>
            {typeof issueDate === "string" && issueDate ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => form.setValue("dueDate", addDays(issueDate, invoiceDueDays), { shouldValidate: true })}
              >
                Reset due date
              </Button>
            ) : null}
          </div>
        </FormSection>

        <FormSection title="Line items" description="Quantity × unit price. Totals update as you type.">
          <div className="flex flex-col gap-3">
            <div className="hidden grid-cols-[10rem_1fr_5rem_8rem_7rem_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground lg:grid">
              <span>Charge</span>
              <span>Description</span>
              <span>Qty</span>
              <span>Unit price</span>
              <span className="text-end">Amount</span>
              <span />
            </div>
            {fields.map((field, index) => {
              const err = Array.isArray(itemErrors) ? itemErrors[index] : undefined;
              const row = items?.[index];
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-2 gap-2 rounded-lg border p-3 lg:grid-cols-[10rem_1fr_5rem_8rem_7rem_2rem] lg:items-start lg:border-0 lg:p-0"
                >
                  <div className="col-span-2 lg:col-span-1">
                    <Select
                      value={row?.type ?? "OTHER"}
                      onValueChange={(v) => {
                        const prev = form.getValues(`items.${index}`);
                        form.setValue(`items.${index}.type`, v as NonNullable<typeof row>["type"], { shouldDirty: true });
                        // Keep the description in sync while it is still the default label.
                        const labels = Object.values(chargeTypeLabels) as string[];
                        if (!prev?.description || labels.includes(prev.description)) {
                          form.setValue(`items.${index}.description`, chargeTypeLabels[v as keyof typeof chargeTypeLabels], { shouldValidate: true });
                        }
                        if (v === "MONTHLY_RENT" && stay && !(Number(prev?.unitPrice) > 0)) {
                          form.setValue(`items.${index}.unitPrice`, stay.monthlyRent);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full" aria-label={`Charge type, line ${index + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {chargeOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <Input
                      {...form.register(`items.${index}.description`)}
                      placeholder="Description"
                      aria-label={`Description, line ${index + 1}`}
                      aria-invalid={!!err?.description}
                    />
                    {err?.description?.message ? <p className="mt-1 text-xs text-destructive">{err.description.message}</p> : null}
                  </div>
                  <div>
                    <Input
                      {...form.register(`items.${index}.quantity`)}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      aria-label={`Quantity, line ${index + 1}`}
                      aria-invalid={!!err?.quantity}
                    />
                    {err?.quantity?.message ? <p className="mt-1 text-xs text-destructive">{err.quantity.message}</p> : null}
                  </div>
                  <div>
                    <Input
                      {...form.register(`items.${index}.unitPrice`)}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      aria-label={`Unit price, line ${index + 1}`}
                      aria-invalid={!!err?.unitPrice}
                    />
                    {err?.unitPrice?.message ? <p className="mt-1 text-xs text-destructive">{err.unitPrice.message}</p> : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 lg:h-8 lg:justify-end">
                    <span className="text-xs text-muted-foreground lg:hidden">Amount</span>
                    <span className="tabular text-sm font-medium">
                      {fmt.money(lineAmount({ quantity: Number(row?.quantity) || 0, unitPrice: Number(row?.unitPrice) || 0 }))}
                    </span>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })}
            {typeof itemErrors?.message === "string" ? <p className="text-sm text-destructive">{itemErrors.message}</p> : null}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fields.length >= 50}
                onClick={() => append({ type: "OTHER", description: "", quantity: 1, unitPrice: 0 })}
              >
                <Plus /> Add line
              </Button>
            </div>
          </div>
        </FormSection>

        <FormSection title="Totals">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <MoneyField control={c} name="discount" label="Discount" currency={fmt.currency} />
              {taxRate > 0 ? (
                <SwitchField control={c} name="applyTax" label={`Apply ${taxLabel} (${taxRate}%)`} description="Calculated on the amount after discount." />
              ) : null}
            </div>
            <dl className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular">{fmt.money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular">{totals.discount > 0 ? `− ${fmt.money(totals.discount)}` : fmt.money(0)}</dd>
              </div>
              {taxRate > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {taxLabel} {applyTax ? `(${taxRate}%)` : "(not applied)"}
                  </dt>
                  <dd className="tabular">{fmt.money(totals.tax)}</dd>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{fmt.money(totals.total)}</dd>
              </div>
            </dl>
          </div>
        </FormSection>

        <FormSection title="Notes" description="Shown on the invoice.">
          <TextareaField control={c} name="notes" rows={3} placeholder="Payment instructions, bank details or remarks" />
        </FormSection>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        {allowDraft ? (
          <Button type="submit" variant="outline" disabled={pending} onClick={submitAs("DRAFT")}>
            Save as draft
          </Button>
        ) : null}
        <span onClickCapture={submitAs("PENDING")} className="contents">
          <SubmitButton pending={pending}>{editing && !allowDraft ? "Save changes" : "Issue invoice"}</SubmitButton>
        </span>
      </div>
    </form>
  );
}
