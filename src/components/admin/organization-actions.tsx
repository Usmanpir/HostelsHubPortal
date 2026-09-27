"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarPlus, Package, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { SelectField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { changePlanSchema, extendTrialSchema } from "@/lib/validation/admin";
import { formatMoney } from "@/lib/format";
import { changeOrganizationPlanAction, extendTrialAction, setOrganizationStatusAction } from "@/app/admin/actions";
import type { BillingInterval, OrganizationStatus } from "@/generated/prisma/enums";

export function OrganizationStatusButton({ id, name, status }: { id: string; name: string; status: OrganizationStatus }) {
  if (status === "CLOSED") return null;
  if (status === "SUSPENDED") {
    return (
      <ConfirmAction
        trigger={
          <Button variant="outline">
            <PlayCircle />
            Reactivate
          </Button>
        }
        title={`Reactivate ${name}?`}
        description="Members regain access to their workspace immediately."
        confirmLabel="Reactivate"
        action={(reason) => setOrganizationStatusAction(id, { status: "ACTIVE", reason })}
        reason={{ label: "Note (optional)", placeholder: "e.g. Payment received" }}
      />
    );
  }
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" className="text-destructive">
          <Ban />
          Suspend
        </Button>
      }
      title={`Suspend ${name}?`}
      description="All members and residents lose access until the organization is reactivated. No data is deleted."
      confirmLabel="Suspend organization"
      destructive
      action={(reason) => setOrganizationStatusAction(id, { status: "SUSPENDED", reason })}
      reason={{ label: "Reason", required: true, placeholder: "Recorded in the audit log" }}
    />
  );
}

export type PlanOption = {
  id: string;
  name: string;
  isActive: boolean;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
};

export function ChangePlanDialog({
  id,
  plans,
  current,
}: {
  id: string;
  plans: PlanOption[];
  current: { planId: string; interval: BillingInterval } | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const active = plans.filter((p) => p.isActive);
  const { form, onSubmit, pending } = useActionForm({
    schema: changePlanSchema,
    defaultValues: { planId: current?.planId ?? active[0]?.id ?? "", interval: current?.interval ?? "MONTHLY" },
    action: (v) => changeOrganizationPlanAction(id, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline">
          <Package />
          Change plan
        </Button>
      }
      title="Change plan"
      description="The subscription becomes active on the selected plan and a new billing period starts today."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField
          control={form.control}
          name="planId"
          label="Plan"
          required
          options={active.map((p) => ({
            value: p.id,
            label: `${p.name} — ${formatMoney(p.priceMonthly, p.currency)}/mo · ${formatMoney(p.priceYearly, p.currency)}/yr`,
          }))}
        />
        <SelectField
          control={form.control}
          name="interval"
          label="Billing interval"
          options={[
            { value: "MONTHLY", label: "Monthly" },
            { value: "YEARLY", label: "Yearly" },
          ]}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Apply plan</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export function ExtendTrialDialog({ id, disabled }: { id: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: extendTrialSchema,
    defaultValues: { days: 14 },
    action: (v) => extendTrialAction(id, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" disabled={disabled}>
          <CalendarPlus />
          Extend trial
        </Button>
      }
      title="Extend trial"
      description="Adds days to the current trial (or starts a new trial from today if it has ended)."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField control={form.control} name="days" label="Days to add" type="number" inputMode="numeric" required />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Extend trial</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
