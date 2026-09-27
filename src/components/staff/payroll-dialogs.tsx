"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormGrid, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters } from "@/components/shared/org-context";
import { optionsFrom, paymentMethodLabels } from "@/config/labels";
import { payrollComponentsSchema, payrollPaySchema } from "@/lib/validation/staff";
import { calculateNetSalary } from "@/services/staff/payroll-calc";
import { cn } from "@/lib/utils";
import { payPayrollAction, updatePayrollAction } from "@/app/(app)/staff/actions";

export type PayrollDialogRecord = {
  id: string;
  staffName: string;
  periodLabel: string;
  baseSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  advances: number;
  netSalary: number;
  notes: string | null;
};

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function PayrollEditDialog({
  record,
  open,
  onOpenChange,
}: {
  record: PayrollDialogRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const fmt = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: payrollComponentsSchema,
    defaultValues: {
      baseSalary: record.baseSalary,
      allowances: record.allowances,
      bonus: record.bonus,
      deductions: record.deductions,
      advances: record.advances,
      notes: record.notes ?? "",
    },
    action: (v) => updatePayrollAction(record.id, v),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  const c = form.control;
  const values = form.watch();
  const net = calculateNetSalary({
    baseSalary: num(values.baseSalary),
    allowances: num(values.allowances),
    bonus: num(values.bonus),
    deductions: num(values.deductions),
    advances: num(values.advances),
  });

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={`Edit salary · ${record.staffName}`} description={record.periodLabel}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <MoneyField control={c} name="baseSalary" label="Base salary" required currency={fmt.currency} />
        <FormGrid>
          <MoneyField control={c} name="allowances" label="Allowances" currency={fmt.currency} />
          <MoneyField control={c} name="bonus" label="Bonus" currency={fmt.currency} />
          <MoneyField control={c} name="deductions" label="Deductions" currency={fmt.currency} />
          <MoneyField control={c} name="advances" label="Advances recovered" currency={fmt.currency} />
        </FormGrid>
        <TextareaField control={c} name="notes" label="Notes" rows={2} placeholder="Reason for bonus or deduction" />
        <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5", net < 0 ? "border-destructive/40 bg-danger-soft" : "bg-muted/40")}>
          <span className="text-sm text-muted-foreground">Net salary</span>
          <span className={cn("tabular text-lg font-semibold", net < 0 && "text-danger")}>{fmt.money(net)}</span>
        </div>
        {net < 0 ? (
          <p className="-mt-2 flex items-center gap-1.5 text-sm text-danger">
            <AlertTriangle className="size-4" />
            Net salary can&apos;t be negative. Reduce deductions or advances.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export function PayrollPayDialog({
  record,
  open,
  onOpenChange,
  today,
}: {
  record: PayrollDialogRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
}) {
  const router = useRouter();
  const fmt = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: payrollPaySchema,
    defaultValues: { paymentDate: today, paymentMethod: "BANK_TRANSFER", reference: "", notes: record.notes ?? "" },
    action: (v) => payPayrollAction(record.id, v),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={`Pay ${record.staffName}`} description={`${record.periodLabel} salary`}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">Amount to pay</span>
          <span className="tabular text-lg font-semibold">{fmt.money(record.netSalary)}</span>
        </div>
        <FormGrid>
          <TextField control={c} name="paymentDate" label="Payment date" type="date" required />
          <SelectField control={c} name="paymentMethod" label="Method" required options={optionsFrom(paymentMethodLabels)} />
        </FormGrid>
        <TextField control={c} name="reference" label="Reference" placeholder="Bank transaction ID or cheque no." />
        <TextareaField control={c} name="notes" label="Notes" rows={2} />
        <p className="text-xs text-muted-foreground">Paid salaries are locked and can no longer be edited.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingText="Recording…">
            Mark as paid
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
