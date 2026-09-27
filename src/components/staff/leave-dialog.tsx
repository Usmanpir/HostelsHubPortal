"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { leaveTypeLabels, optionsFrom } from "@/config/labels";
import { leaveSchema } from "@/lib/validation/staff";
import { createLeaveAction } from "@/app/(app)/staff/actions";

function daysBetween(start: unknown, end: unknown) {
  if (typeof start !== "string" || typeof end !== "string" || !start || !end) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86400_000) + 1;
}

export function LeaveDialog({
  trigger,
  staff,
  defaultStaffId,
  today,
}: {
  trigger: React.ReactNode;
  staff: { id: string; name: string; employeeCode: string }[];
  defaultStaffId?: string | null;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const initialStaff = defaultStaffId && staff.some((s) => s.id === defaultStaffId) ? defaultStaffId : staff.length === 1 ? staff[0]!.id : "";
  const { form, onSubmit, pending } = useActionForm({
    schema: leaveSchema,
    defaultValues: { staffId: initialStaff, type: "CASUAL", startDate: today, endDate: today, reason: "" },
    action: createLeaveAction,
    onSuccess: () => {
      setOpen(false);
      form.reset();
      router.refresh();
    },
  });
  const c = form.control;
  const days = daysBetween(form.watch("startDate"), form.watch("endDate"));

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="New leave request"
      description="Approved leave is suggested automatically on the daily attendance sheet."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField
          control={c}
          name="staffId"
          label="Staff member"
          required
          disabled={staff.length === 1}
          options={staff.map((s) => ({ value: s.id, label: `${s.name} · ${s.employeeCode}` }))}
        />
        <SelectField control={c} name="type" label="Leave type" required options={optionsFrom(leaveTypeLabels)} />
        <FormGrid>
          <TextField control={c} name="startDate" label="From" type="date" required />
          <TextField control={c} name="endDate" label="To" type="date" required />
        </FormGrid>
        {days ? (
          <p className="-mt-2 text-sm text-muted-foreground">
            {days} calendar day{days === 1 ? "" : "s"}
          </p>
        ) : null}
        <TextareaField control={c} name="reason" label="Reason" rows={3} placeholder="Family event, medical appointment…" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Submit request</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
