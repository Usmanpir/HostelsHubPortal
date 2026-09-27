"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Info, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { CheckboxField, FormGrid, FormSection, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { EnumBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import { invoiceStatusLabels, invoiceStatusTones, optionsFrom, paymentMethodLabels } from "@/config/labels";
import { paymentSchema } from "@/lib/validation/finance";
import type { ResidentBillingContext } from "@/services/finance/billing-residents";
import { recordPaymentAction, residentBillingContextAction } from "@/app/(app)/finance/actions";
import { cn } from "@/lib/utils";
import { ResidentPicker, type ResidentPickerOption } from "./resident-picker";

const ADVANCE = "__advance__";

export function PaymentForm({
  initialResident,
  initialInvoiceId,
  today,
}: {
  initialResident: ResidentPickerOption | null;
  initialInvoiceId?: string | null;
  today: string;
}) {
  const router = useRouter();
  const fmt = useFormatters();
  const [resident, setResident] = useState<ResidentPickerOption | null>(initialResident);
  const [billing, setBilling] = useState<ResidentBillingContext | null>(null);
  const [loading, startLoading] = useTransition();

  const { form, onSubmit, pending } = useActionForm({
    schema: paymentSchema,
    defaultValues: {
      residentId: initialResident?.id ?? "",
      invoiceId: initialInvoiceId ?? "",
      amount: "",
      method: "CASH",
      reference: "",
      paymentDate: today,
      notes: "",
      recordExcessAsAdvance: false,
    },
    action: recordPaymentAction,
    successMessage: (data) =>
      data.receiptNumbers.length > 1 ? `Payment recorded · receipts ${data.receiptNumbers.join(", ")}` : `Payment recorded · receipt ${data.receiptNumbers[0]}`,
    onSuccess: (data) => {
      router.push(`/finance/payments/${data.id}`);
      router.refresh();
    },
  });
  const c = form.control;
  const invoiceId = useWatch({ control: c, name: "invoiceId" });
  const amount = Number(useWatch({ control: c, name: "amount" })) || 0;

  const selected = billing?.openInvoices.find((i) => i.id === invoiceId) ?? null;
  const excess = selected ? Math.round((amount - selected.balance) * 100) / 100 : 0;

  const load = useCallback(
    (residentId: string, preferInvoiceId?: string | null) => {
      startLoading(async () => {
        const result = await residentBillingContextAction(residentId);
        if (!result.ok) {
          toast.error(result.error);
          setBilling(null);
          return;
        }
        setBilling(result.data);
        const open = result.data.openInvoices;
        const pick = open.find((i) => i.id === preferInvoiceId) ?? (preferInvoiceId === undefined ? open[0] : undefined);
        if (preferInvoiceId && !open.some((i) => i.id === preferInvoiceId)) {
          toast.info("That invoice is no longer open. Choose another invoice or record an advance.");
        }
        form.setValue("invoiceId", pick?.id ?? "");
        if (pick) form.setValue("amount", pick.balance, { shouldValidate: true });
      });
    },
    [form],
  );

  useEffect(() => {
    if (initialResident) load(initialResident.id, initialInvoiceId ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickResident = (option: ResidentPickerOption | null) => {
    setResident(option);
    setBilling(null);
    form.setValue("residentId", option?.id ?? "", { shouldValidate: !!option });
    form.setValue("invoiceId", "");
    form.setValue("recordExcessAsAdvance", false);
    if (option) load(option.id);
  };

  const chooseInvoice = (value: string) => {
    const id = value === ADVANCE ? "" : value;
    form.setValue("invoiceId", id);
    form.setValue("recordExcessAsAdvance", false);
    const inv = billing?.openInvoices.find((i) => i.id === id);
    if (inv) form.setValue("amount", inv.balance, { shouldValidate: true });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6">
        <FormSection title="Resident">
          <Field data-invalid={!!form.formState.errors.residentId}>
            <FieldLabel htmlFor="payment-resident">
              Resident<span className="text-destructive">*</span>
            </FieldLabel>
            <ResidentPicker id="payment-resident" value={resident} onChange={pickResident} invalid={!!form.formState.errors.residentId} />
            <FieldError errors={[form.formState.errors.residentId]} />
          </Field>
          {billing ? (
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="tabular font-medium">{fmt.money(billing.balance.outstanding)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className={cn("tabular font-medium", billing.balance.overdue > 0 && "text-danger")}>{fmt.money(billing.balance.overdue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Credit</p>
                <p className={cn("tabular font-medium", billing.balance.credit > 0 && "text-success")}>{fmt.money(billing.balance.credit)}</p>
              </div>
            </div>
          ) : null}
        </FormSection>

        <FormSection title="Apply to" description="Pick the invoice being paid, or keep the money as advance credit.">
          {!resident ? (
            <p className="text-sm text-muted-foreground">Choose a resident to see their open invoices.</p>
          ) : loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading open invoices…
            </p>
          ) : billing ? (
            <RadioGroup value={invoiceId || ADVANCE} onValueChange={chooseInvoice} className="gap-2" aria-label="Invoice">
              {billing.openInvoices.map((inv) => (
                <label
                  key={inv.id}
                  htmlFor={`inv-${inv.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40",
                    invoiceId === inv.id && "border-primary/50 bg-accent/40",
                  )}
                >
                  <RadioGroupItem id={`inv-${inv.id}`} value={inv.id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium">{inv.invoiceNumber}</span>
                      <EnumBadge value={inv.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Due {fmt.date(inv.dueDate)} · Total {fmt.money(inv.total)}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="tabular text-sm font-semibold">{fmt.money(inv.balance)}</p>
                  </div>
                </label>
              ))}
              <label
                htmlFor="inv-advance"
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 transition-colors hover:bg-accent/40",
                  !invoiceId && "border-primary/50 bg-accent/40",
                )}
              >
                <RadioGroupItem id="inv-advance" value={ADVANCE} />
                <PiggyBank className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">No invoice — advance payment</p>
                  <p className="text-xs text-muted-foreground">Kept as credit on the resident&apos;s account and can be applied to future invoices.</p>
                </div>
              </label>
              {billing.openInvoices.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Info className="size-3.5" /> This resident has no unpaid invoices.
                </p>
              ) : null}
            </RadioGroup>
          ) : null}
        </FormSection>

        <FormSection title="Payment">
          <FormGrid>
            <MoneyField
              control={c}
              name="amount"
              label="Amount"
              required
              currency={fmt.currency}
              description={selected ? `Invoice balance ${fmt.money(selected.balance)}` : undefined}
            />
            <TextField control={c} name="paymentDate" label="Payment date" type="date" required />
            <SelectField control={c} name="method" label="Method" required options={optionsFrom(paymentMethodLabels)} />
            <TextField control={c} name="reference" label="Reference" placeholder="Bank ref, cheque or transaction ID" />
          </FormGrid>
          {selected && excess > 0 ? (
            <div className="rounded-lg border border-warning/40 bg-warning-soft p-3">
              <CheckboxField
                control={c}
                name="recordExcessAsAdvance"
                label={`Record excess ${fmt.money(excess)} as advance credit`}
                description={`${fmt.money(selected.balance)} settles ${selected.invoiceNumber}; the rest is kept as credit. Leave unchecked to correct the amount instead.`}
              />
            </div>
          ) : null}
          <TextareaField control={c} name="notes" label="Notes" rows={2} />
        </FormSection>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingText="Recording…">
          Record payment{amount > 0 ? ` · ${fmt.money(amount)}` : ""}
        </SubmitButton>
      </div>
    </form>
  );
}
