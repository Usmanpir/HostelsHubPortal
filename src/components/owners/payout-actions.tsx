"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextareaField, TextField, FormGrid } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { optionsFrom, paymentMethodLabels } from "@/config/labels";
import type { OwnerPayoutStatus } from "@/generated/prisma/enums";
import { payPayoutSchema } from "@/lib/validation/owners";
import { periodLabel } from "@/services/owners/period";
import { cancelPayoutAction, markPayoutPaidAction } from "@/app/(app)/owners/actions";

export type PayoutActionTarget = {
  id: string;
  status: OwnerPayoutStatus;
  netPayable: number;
  periodStart: string;
  periodEnd: string;
  owner: { name: string };
};

function PayPayoutDialog({ payout, today, trigger }: { payout: PayoutActionTarget; today: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const fmt = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: payPayoutSchema,
    defaultValues: { paidAt: today, paymentMethod: "BANK_TRANSFER", reference: "", notes: "" },
    action: (values) => markPayoutPaidAction(payout.id, values),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !pending && setOpen(o)}
      trigger={trigger}
      title="Mark payout as paid"
      description={`${fmt.money(payout.netPayable)} to ${payout.owner.name} for ${periodLabel({ from: payout.periodStart, to: payout.periodEnd })}.`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormGrid>
          <TextField control={c} name="paidAt" label="Paid on" type="date" required />
          <SelectField control={c} name="paymentMethod" label="Method" required options={optionsFrom(paymentMethodLabels)} />
        </FormGrid>
        <TextField control={c} name="reference" label="Reference" placeholder="Cheque or transaction ID" />
        <TextareaField control={c} name="notes" label="Notes" rows={2} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Mark as paid</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

/** Pay / cancel buttons for a pending payout (renders nothing otherwise or without owners.manage). */
export function PayoutActions({ payout, today, size = "sm" }: { payout: PayoutActionTarget; today: string; size?: "sm" | "icon-sm" }) {
  const canManage = useCan()("owners.manage");
  const fmt = useFormatters();
  if (!canManage || payout.status !== "PENDING") return null;
  const icon = size === "icon-sm";
  return (
    <div className="flex items-center justify-end gap-1">
      <PayPayoutDialog
        payout={payout}
        today={today}
        trigger={
          <Button size={size} variant={icon ? "ghost" : "outline"} aria-label="Mark paid">
            <CircleCheck />
            {icon ? null : "Mark paid"}
          </Button>
        }
      />
      <ConfirmAction
        trigger={
          <Button size={size} variant="ghost" className="text-destructive" aria-label="Cancel payout">
            <Ban />
            {icon ? null : "Cancel"}
          </Button>
        }
        title="Cancel this payout?"
        description={`${fmt.money(payout.netPayable)} for ${periodLabel({ from: payout.periodStart, to: payout.periodEnd })}. Cancelled payouts stay on record; you can create a new one for the same period.`}
        confirmLabel="Cancel payout"
        destructive
        reason={{ label: "Reason (optional)", placeholder: "e.g. Figures changed after late payments" }}
        action={cancelPayoutAction.bind(null, payout.id)}
      />
    </div>
  );
}
