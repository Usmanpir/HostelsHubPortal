"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FormGrid, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters } from "@/components/shared/org-context";
import { optionsFrom, paymentMethodLabels } from "@/config/labels";
import { expenseSchema } from "@/lib/validation/finance";
import { toDateInput } from "@/lib/format";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { createExpenseAction, updateExpenseAction } from "@/app/(app)/finance/actions";

export type ExpenseForEdit = {
  id: string;
  hostelId: string;
  categoryId: string;
  amount: number;
  date: Date | string;
  vendor: string | null;
  description: string | null;
  paymentMethod: PaymentMethod;
  reference: string | null;
  receipt: { id: string; originalName: string; size: number; mimeType: string } | null;
};

export function ExpenseDialog({
  trigger,
  hostels,
  categories,
  defaultHostelId,
  today,
  expense,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  hostels: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  defaultHostelId?: string | null;
  today: string;
  expense?: ExpenseForEdit;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const router = useRouter();
  const fmt = useFormatters();
  const initialReceipt: UploadedFile | null = expense?.receipt
    ? { id: expense.receipt.id, name: expense.receipt.originalName, size: expense.receipt.size, mimeType: expense.receipt.mimeType }
    : null;
  const [receipt, setReceipt] = useState<UploadedFile | null>(initialReceipt);

  const { form, onSubmit, pending } = useActionForm({
    schema: expenseSchema,
    defaultValues: expense
      ? {
          hostelId: expense.hostelId,
          categoryId: expense.categoryId,
          amount: expense.amount,
          date: toDateInput(expense.date),
          vendor: expense.vendor ?? "",
          description: expense.description ?? "",
          paymentMethod: expense.paymentMethod,
          reference: expense.reference ?? "",
          receiptFileId: expense.receipt?.id ?? "",
        }
      : {
          hostelId: defaultHostelId ?? (hostels.length === 1 ? hostels[0]!.id : ""),
          categoryId: "",
          amount: "",
          date: today,
          vendor: "",
          description: "",
          paymentMethod: "CASH",
          reference: "",
          receiptFileId: "",
        },
    action: (values) => (expense ? updateExpenseAction(expense.id, values) : createExpenseAction(values)),
    onSuccess: () => {
      setOpen(false);
      if (!expense) {
        form.reset();
        setReceipt(null);
      }
      router.refresh();
    },
  });
  const c = form.control;

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !pending && setOpen(o)}
      trigger={trigger}
      title={expense ? "Edit expense" : "Record expense"}
      description={expense ? "Changes are kept in the audit log." : "Money spent running a hostel: utilities, salaries, repairs, supplies…"}
      className="sm:max-w-xl"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormGrid>
          <SelectField control={c} name="hostelId" label="Hostel" required options={hostels.map((h) => ({ value: h.id, label: h.name }))} />
          <SelectField control={c} name="categoryId" label="Category" required options={categories.map((cat) => ({ value: cat.id, label: cat.name }))} />
          <MoneyField control={c} name="amount" label="Amount" required currency={fmt.currency} />
          <TextField control={c} name="date" label="Date" type="date" required />
          <TextField control={c} name="vendor" label="Vendor / payee" placeholder="e.g. K-Electric" />
          <SelectField control={c} name="paymentMethod" label="Paid by" options={optionsFrom(paymentMethodLabels)} />
        </FormGrid>
        <TextField control={c} name="reference" label="Reference" placeholder="Bill number, cheque or transaction ID" />
        <TextareaField control={c} name="description" label="Description" rows={2} />
        <Field>
          <FieldLabel>Receipt</FieldLabel>
          <FileUpload
            purpose="expense-receipt"
            value={receipt}
            onChange={(file) => {
              setReceipt(file);
              form.setValue("receiptFileId", file?.id ?? "", { shouldDirty: true });
            }}
            label="Upload receipt or bill"
          />
          {receipt && expense?.receipt?.id === receipt.id ? (
            <FieldDescription>
              <a href={`/api/files/${receipt.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                Open current receipt
              </a>
            </FieldDescription>
          ) : null}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{expense ? "Save changes" : "Record expense"}</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
