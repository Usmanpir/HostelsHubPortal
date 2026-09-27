"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { CheckCircle2, CircleSlash, Pencil, Play, RotateCcw, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { bedStatusLabels, maintenanceCategoryLabels, maintenanceStatusLabels, optionsFrom } from "@/config/labels";
import type { BedStatus, MaintenanceCategory, MaintenanceStatus, Priority } from "@/generated/prisma/enums";
import { maintenanceAssignSchema, maintenanceEditSchema, maintenanceStatusSchema } from "@/lib/validation/operations";
import {
  assignMaintenanceAction,
  updateMaintenanceAction,
  updateMaintenanceStatusAction,
} from "@/app/(app)/operations/actions";
import { PriorityField } from "./priority-field";
import { ResidentField, useAssignableStaff, useHostelLocations, type ResidentOption } from "./pickers";
import { staffOptionLabel } from "./maintenance-form";

type Variant = "default" | "outline" | "destructive" | "secondary";

export function maintenanceTransitionMeta(from: MaintenanceStatus, to: MaintenanceStatus): { label: string; icon: LucideIcon; variant: Variant } {
  if (to === "IN_PROGRESS") return from === "COMPLETED" ? { label: "Reopen", icon: RotateCcw, variant: "outline" } : { label: "Start work", icon: Play, variant: "default" };
  if (to === "COMPLETED") return { label: "Mark completed", icon: CheckCircle2, variant: "default" };
  if (to === "REJECTED") return { label: "Reject", icon: CircleSlash, variant: "destructive" };
  if (to === "OPEN") return { label: from === "REJECTED" ? "Reopen" : "Move back to open", icon: RotateCcw, variant: "outline" };
  return { label: "Mark assigned", icon: UserPlus, variant: "outline" };
}

/** Confirm a status change with optional notes (required when rejecting). */
export function MaintenanceStatusDialog({
  requestId,
  from,
  to,
  notes,
  canReleaseBed,
  trigger,
  onDone,
}: {
  requestId: string;
  from: MaintenanceStatus;
  to: MaintenanceStatus;
  notes: string | null;
  canReleaseBed?: boolean;
  trigger: React.ReactNode;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const meta = maintenanceTransitionMeta(from, to);
  const closing = to === "COMPLETED" || to === "REJECTED";
  const { form, onSubmit, pending } = useActionForm({
    schema: maintenanceStatusSchema,
    defaultValues: { status: to, notes: notes ?? "", releaseBed: !!canReleaseBed },
    action: (v) => updateMaintenanceStatusAction(requestId, v),
    successMessage: `Marked as ${maintenanceStatusLabels[to].toLowerCase()}`,
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
        if (o) form.reset({ status: to, notes: notes ?? "", releaseBed: !!canReleaseBed });
      }}
      trigger={trigger}
      title={`${meta.label}?`}
      description={`${maintenanceStatusLabels[from]} → ${maintenanceStatusLabels[to]}`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextareaField
          control={form.control}
          name="notes"
          label={to === "REJECTED" ? "Reason" : closing ? "Resolution notes" : "Notes"}
          required={to === "REJECTED"}
          rows={4}
          placeholder={to === "COMPLETED" ? "What was fixed, parts used, follow-ups…" : to === "REJECTED" ? "Why this request won't be actioned" : "Optional"}
        />
        {canReleaseBed && closing ? (
          <CheckboxField control={form.control} name="releaseBed" label="Put the bed back in service" description="Marks the bed as available again." />
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending} variant={meta.variant === "destructive" ? "destructive" : "default"}>
            {meta.label}
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

/** Status transition buttons for a request. */
export function MaintenanceStatusButtons({
  requestId,
  status,
  allowed,
  notes,
  canReleaseBed,
  size = "default",
  className,
}: {
  requestId: string;
  status: MaintenanceStatus;
  allowed: MaintenanceStatus[];
  notes: string | null;
  canReleaseBed?: boolean;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  // "Assigned" is reached by assigning staff, not by a button.
  const targets = allowed.filter((s) => s !== "ASSIGNED");
  if (targets.length === 0) return null;
  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {targets.map((to) => {
        const meta = maintenanceTransitionMeta(status, to);
        const Icon = meta.icon;
        return (
          <MaintenanceStatusDialog
            key={to}
            requestId={requestId}
            from={status}
            to={to}
            notes={notes}
            canReleaseBed={canReleaseBed}
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

/** Update resolution notes without changing status. */
export function MaintenanceNotesForm({ requestId, status, notes }: { requestId: string; status: MaintenanceStatus; notes: string | null }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: maintenanceStatusSchema,
    defaultValues: { status, notes: notes ?? "", releaseBed: false },
    action: (v) => updateMaintenanceStatusAction(requestId, { ...v, status }),
    successMessage: "Notes saved",
    onSuccess: () => router.refresh(),
  });
  const value = useWatch({ control: form.control, name: "notes" });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <TextareaField control={form.control} name="notes" rows={3} placeholder="Progress notes, parts needed, resolution…" />
      <div className="flex justify-end">
        <SubmitButton pending={pending} variant="outline" pendingText="Saving…">
          {(value ?? "") === (notes ?? "") ? "Notes saved" : "Save notes"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function MaintenanceAssignDialog({
  requestId,
  hostelId,
  assignedStaffId,
  trigger,
}: {
  requestId: string;
  hostelId: string;
  assignedStaffId: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const staff = useAssignableStaff(open ? hostelId : null);
  const { form, onSubmit, pending } = useActionForm({
    schema: maintenanceAssignSchema,
    defaultValues: { assignedStaffId: assignedStaffId ?? "" },
    action: (v) => assignMaintenanceAction(requestId, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <FormDialog open={open} onOpenChange={setOpen} trigger={trigger} title="Assign staff" description="The assignee gets a notification and sees the job in My tasks.">
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

export type MaintenanceEditable = {
  id: string;
  hostelId: string;
  roomId: string | null;
  bedId: string | null;
  category: MaintenanceCategory;
  priority: Priority;
  title: string;
  description: string | null;
  resident: { id: string; firstName: string; lastName: string; residentCode: string } | null;
};

export function MaintenanceEditDialog({ request }: { request: MaintenanceEditable }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [resident, setResident] = useState<ResidentOption | null>(
    request.resident
      ? { id: request.resident.id, name: `${request.resident.firstName} ${request.resident.lastName}`, code: request.resident.residentCode, hostelId: request.hostelId }
      : null,
  );
  const { form, onSubmit, pending } = useActionForm({
    schema: maintenanceEditSchema,
    defaultValues: {
      roomId: request.roomId ?? "",
      bedId: request.bedId ?? "",
      residentId: request.resident?.id ?? "",
      category: request.category,
      priority: request.priority,
      title: request.title,
      description: request.description ?? "",
    },
    action: (v) => updateMaintenanceAction(request.id, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const c = form.control;
  const roomId = useWatch({ control: c, name: "roomId" });
  const locations = useHostelLocations(open ? request.hostelId : null);
  const room = (locations.data ?? []).find((r) => r.id === roomId);

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline">
          <Pencil />
          Edit
        </Button>
      }
      title="Edit request"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField control={c} name="title" label="Title" required />
        <SelectField control={c} name="category" label="Category" required options={optionsFrom(maintenanceCategoryLabels)} />
        <PriorityField control={c} name="priority" />
        <TextareaField control={c} name="description" label="Details" rows={3} />
        <FormGrid>
          <SelectField
            control={c}
            name="roomId"
            label="Room"
            allowEmpty="Common area"
            placeholder={locations.isLoading ? "Loading…" : "Select room"}
            disabled={locations.isLoading}
            options={(locations.data ?? []).map((r) => ({ value: r.id, label: `Room ${r.roomNumber} · ${r.floorName}` }))}
            onValueChange={() => form.setValue("bedId", "")}
          />
          <SelectField
            control={c}
            name="bedId"
            label="Bed"
            allowEmpty="Whole room"
            disabled={!room}
            options={(room?.beds ?? []).map((b) => ({ value: b.id, label: `Bed ${b.bedNumber} · ${bedStatusLabels[b.status as BedStatus] ?? b.status}` }))}
          />
        </FormGrid>
        <ResidentField control={c} name="residentId" hostelId={request.hostelId} selected={resident} onSelectedChange={setResident} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save changes</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
