"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Lock, Play, RotateCcw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextareaField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { complaintStatusLabels } from "@/config/labels";
import type { ComplaintStatus } from "@/generated/prisma/enums";
import { complaintAssignSchema, complaintStatusSchema } from "@/lib/validation/operations";
import { assignComplaintAction, updateComplaintStatusAction } from "@/app/(app)/operations/actions";
import { useAssignableStaff } from "./pickers";
import { staffOptionLabel } from "./maintenance-form";

type Variant = "default" | "outline" | "destructive";

export function complaintTransitionMeta(from: ComplaintStatus, to: ComplaintStatus): { label: string; icon: LucideIcon; variant: Variant } {
  switch (to) {
    case "UNDER_REVIEW":
      return { label: "Start review", icon: Eye, variant: "outline" };
    case "IN_PROGRESS":
      return from === "RESOLVED" ? { label: "Reopen", icon: RotateCcw, variant: "outline" } : { label: "Mark in progress", icon: Play, variant: from === "OPEN" ? "outline" : "default" };
    case "RESOLVED":
      return { label: "Resolve", icon: CheckCircle2, variant: "default" };
    case "CLOSED":
      return { label: "Close", icon: Lock, variant: "outline" };
    case "OPEN":
      return { label: from === "CLOSED" ? "Reopen" : "Move back to open", icon: RotateCcw, variant: "outline" };
  }
}

export function ComplaintStatusDialog({
  complaintId,
  from,
  to,
  resolution,
  trigger,
  onDone,
}: {
  complaintId: string;
  from: ComplaintStatus;
  to: ComplaintStatus;
  resolution: string | null;
  trigger: React.ReactNode;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const meta = complaintTransitionMeta(from, to);
  const asksResolution = to === "RESOLVED" || to === "CLOSED";
  const defaults = { status: to, resolution: to === "RESOLVED" || to === "CLOSED" ? (resolution ?? "") : "" };
  const { form, onSubmit, pending } = useActionForm({
    schema: complaintStatusSchema,
    defaultValues: defaults,
    action: (v) => updateComplaintStatusAction(complaintId, v),
    successMessage: `Complaint ${complaintStatusLabels[to].toLowerCase()}`,
    onSuccess: () => {
      setOpen(false);
      onDone?.();
      router.refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(defaults);
      }}
      trigger={trigger}
      title={`${meta.label}?`}
      description={`${complaintStatusLabels[from]} → ${complaintStatusLabels[to]}`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {asksResolution ? (
          <TextareaField
            control={form.control}
            name="resolution"
            label={to === "RESOLVED" ? "Resolution" : "Closing note"}
            required={to === "RESOLVED"}
            rows={4}
            placeholder={to === "RESOLVED" ? "What was done to resolve this? The resident will see this." : "Optional"}
          />
        ) : (
          <p className="text-sm text-muted-foreground">The resident and assignee will be notified of the new status.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{meta.label}</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export function ComplaintStatusButtons({
  complaintId,
  status,
  allowed,
  resolution,
  size = "default",
  className,
}: {
  complaintId: string;
  status: ComplaintStatus;
  allowed: ComplaintStatus[];
  resolution: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  if (allowed.length === 0) return null;
  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {allowed.map((to) => {
        const meta = complaintTransitionMeta(status, to);
        const Icon = meta.icon;
        return (
          <ComplaintStatusDialog
            key={to}
            complaintId={complaintId}
            from={status}
            to={to}
            resolution={resolution}
            trigger={
              <Button variant={meta.variant} size={size}>
                <Icon />
                {meta.label}
              </Button>
            }
          />
        );
      })}
    </div>
  );
}

export function ComplaintAssignDialog({
  complaintId,
  hostelId,
  assignedStaffId,
  trigger,
}: {
  complaintId: string;
  hostelId: string;
  assignedStaffId: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const staff = useAssignableStaff(open ? hostelId : null);
  const { form, onSubmit, pending } = useActionForm({
    schema: complaintAssignSchema,
    defaultValues: { assignedStaffId: assignedStaffId ?? "" },
    action: (v) => assignComplaintAction(complaintId, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <FormDialog open={open} onOpenChange={setOpen} trigger={trigger} title="Assign staff" description="The assignee is notified and sees the complaint in My tasks.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField
          control={form.control}
          name="assignedStaffId"
          label="Staff member"
          allowEmpty="Unassigned"
          placeholder={staff.isLoading ? "Loading staff…" : "Select staff"}
          disabled={staff.isLoading}
          options={(staff.data ?? []).map((s) => ({ value: s.id, label: staffOptionLabel(s) }))}
          description={staff.isError ? staff.error.message : staff.data?.length === 0 ? "No staff are assigned to this hostel yet." : undefined}
        />
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
