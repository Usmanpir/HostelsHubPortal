"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { SelectField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useOrg } from "@/components/shared/org-context";
import { todayInTimeZone, toDateInput } from "@/lib/format";
import { leadAssignSchema, leadFollowUpSchema } from "@/lib/validation/real-estate";
import { archiveLeadAction, assignLeadAction, setLeadFollowUpAction } from "@/app/(app)/leads/actions";

export function AssignLeadDialog({
  leadId,
  assignedUserId,
  agents,
  trigger,
}: {
  leadId: string;
  assignedUserId: string | null;
  agents: { id: string; name: string }[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { form, onSubmit, pending } = useActionForm({
    schema: leadAssignSchema,
    defaultValues: { assignedUserId: assignedUserId ?? "" },
    action: (v) => assignLeadAction(leadId, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ assignedUserId: assignedUserId ?? "" });
      }}
      trigger={trigger}
      title="Assign lead"
      description="The team member is notified."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField control={form.control} name="assignedUserId" label="Assigned to" allowEmpty="Unassigned" options={agents.map((a) => ({ value: a.id, label: a.name }))} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function FollowUpDialog({ leadId, current, trigger }: { leadId: string; current: Date | string | null; trigger: React.ReactNode }) {
  const router = useRouter();
  const { timezone } = useOrg();
  const [open, setOpen] = useState(false);
  const { form, onSubmit, pending } = useActionForm({
    schema: leadFollowUpSchema,
    defaultValues: { nextFollowUpAt: toDateInput(current) },
    action: (v) => setLeadFollowUpAction(leadId, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const today = todayInTimeZone(timezone);
  const quick = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "In 3 days", value: addDays(today, 3) },
    { label: "Next week", value: addDays(today, 7) },
  ];
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ nextFollowUpAt: toDateInput(current) });
      }}
      trigger={trigger}
      title="Next follow-up"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Button key={q.label} type="button" size="sm" variant="outline" onClick={() => form.setValue("nextFollowUpAt", q.value, { shouldDirty: true })}>
              {q.label}
            </Button>
          ))}
        </div>
        <TextField control={form.control} name="nextFollowUpAt" label="Date" type="date" />
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => form.setValue("nextFollowUpAt", "")}>
            Clear
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending}>Save</SubmitButton>
          </div>
        </div>
      </form>
    </FormDialog>
  );
}

export function ArchiveLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" className="justify-start text-destructive">
          <Archive />
          Archive lead
        </Button>
      }
      title="Archive this lead?"
      description="It will be hidden from the pipeline and upcoming viewings are cancelled. Activity history is kept."
      confirmLabel="Archive"
      destructive
      action={() => archiveLeadAction(leadId)}
      onSuccess={() => router.push("/leads")}
    />
  );
}
