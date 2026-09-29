"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters } from "@/components/shared/org-context";
import { createPayoutSchema } from "@/lib/validation/owners";
import { periodLabel } from "@/services/owners/period";
import type { StatementTotals } from "@/services/owners/statement";
import { createPayoutAction } from "@/app/(app)/owners/actions";

/** Snapshot the statement on screen into a pending payout, with optional ± adjustments. */
export function CreatePayoutDialog({
  ownerId,
  ownerName,
  from,
  to,
  totals,
  trigger,
}: {
  ownerId: string;
  ownerName: string;
  from: string;
  to: string;
  totals: StatementTotals;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const fmt = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: createPayoutSchema,
    defaultValues: { ownerId, from, to, adjustments: "", notes: "" },
    action: createPayoutAction,
    onSuccess: () => {
      setOpen(false);
      form.reset({ ownerId, from, to, adjustments: "", notes: "" });
      router.refresh();
    },
  });
  const c = form.control;
  const rawAdjustment = useWatch({ control: c, name: "adjustments" });
  const adjustment = Number(rawAdjustment) || 0;
  const net = Math.round((totals.net + adjustment) * 100) / 100;

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !pending && setOpen(o)}
      trigger={trigger}
      title="Create payout"
      description={`${ownerName} · ${periodLabel({ from, to })}. The statement figures are saved with the payout and won't change later.`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <dl className="grid gap-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
          <Row label="Rent collected" value={fmt.money(totals.collected)} />
          <Row label="Expenses" value={`− ${fmt.money(totals.expenses)}`} />
          <Row label="Management fee" value={`− ${fmt.money(totals.fee)}`} />
          <Row label="Statement net" value={fmt.money(totals.net)} />
          {adjustment !== 0 ? <Row label="Adjustments" value={`${adjustment > 0 ? "+ " : "− "}${fmt.money(Math.abs(adjustment))}`} /> : null}
          <div className="mt-1 flex items-center justify-between border-t pt-2 font-semibold">
            <dt>Net payable</dt>
            <dd className={net < 0 ? "tabular text-danger" : "tabular"}>{fmt.money(net)}</dd>
          </div>
        </dl>
        <TextField
          control={c}
          name="adjustments"
          label={`Adjustments (${fmt.currency})`}
          type="number"
          inputMode="decimal"
          placeholder="0"
          description="Positive adds to the payout (e.g. a reimbursement); negative deducts (e.g. an advance already paid)."
        />
        <TextareaField control={c} name="notes" label="Notes" rows={2} placeholder="Required when you add an adjustment" />
        {net < 0 ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            Net payable is negative — the owner owes you for this period. You can still record it to carry the balance.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingText="Creating…">
            Create payout
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
