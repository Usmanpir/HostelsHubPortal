"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormGrid, MoneyField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters } from "@/components/shared/org-context";
import { renewLeaseSchema } from "@/lib/validation/resident";
import { renewLeaseAction } from "@/app/(app)/residents/actions";

/** "YYYY-MM-DD" + N months − 1 day. */
function addMonths(start: string, months: number) {
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)) - 86400_000).toISOString().slice(0, 10);
}

/** Renew a lease: new end date, optional new rent from a date, and updated terms. */
export function RenewLeaseDialog({
  lease,
  today,
}: {
  lease: {
    id: string;
    monthlyRent: number;
    /** "YYYY-MM-DD" or null */
    leaseEndDate: string | null;
    noticePeriodDays: number | null;
    rentIncrementPercent: number | null;
    leaseTerms: string | null;
  };
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const fmt = useFormatters();
  // A renewal continues from the day after the current end (or from today).
  const nextStart =
    lease.leaseEndDate && lease.leaseEndDate >= today
      ? new Date(Date.parse(`${lease.leaseEndDate}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10)
      : today;
  const { form, onSubmit, pending } = useActionForm({
    schema: renewLeaseSchema,
    defaultValues: {
      assignmentId: lease.id,
      leaseEndDate: addMonths(nextStart, 12),
      newMonthlyRent: "",
      rentEffectiveDate: "",
      noticePeriodDays: lease.noticePeriodDays ?? "",
      rentIncrementPercent: lease.rentIncrementPercent ?? "",
      leaseTerms: lease.leaseTerms ?? "",
    },
    action: renewLeaseAction,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const c = form.control;
  const newRent = form.watch("newMonthlyRent");

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="Renew lease"
      description={
        lease.leaseEndDate
          ? `Current lease ends ${fmt.date(lease.leaseEndDate)} · rent ${fmt.money(lease.monthlyRent)}/month`
          : `Set an end date for this lease · rent ${fmt.money(lease.monthlyRent)}/month`
      }
      trigger={
        <Button size="sm" variant="outline">
          <CalendarPlus />
          Renew lease
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <TextField control={c} name="leaseEndDate" label="New lease end" type="date" required />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Renewal length">
            {[6, 11, 12, 24].map((months) => (
              <Button
                key={months}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => form.setValue("leaseEndDate", addMonths(nextStart, months), { shouldDirty: true })}
              >
                +{months} months
              </Button>
            ))}
          </div>
        </div>
        <FormGrid>
          <MoneyField control={c} name="newMonthlyRent" label="New monthly rent" currency={fmt.currency} description="Leave empty to keep the current rent." />
          <TextField
            control={c}
            name="rentEffectiveDate"
            label="New rent from"
            type="date"
            description={newRent ? "Defaults to today. Future dates apply automatically." : undefined}
            disabled={!newRent}
          />
          <TextField control={c} name="noticePeriodDays" label="Notice period (days)" type="number" />
          <TextField control={c} name="rentIncrementPercent" label="Annual increase (%)" type="number" />
        </FormGrid>
        <TextareaField control={c} name="leaseTerms" label="Lease terms" rows={3} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Renew lease</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
