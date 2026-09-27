"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { complaintCategoryLabels, optionsFrom } from "@/config/labels";
import type { ComplaintCategory, Priority } from "@/generated/prisma/enums";
import { complaintEditSchema, complaintSchema } from "@/lib/validation/operations";
import { createComplaintAction, updateComplaintAction } from "@/app/(app)/operations/actions";
import { PriorityField } from "./priority-field";
import { ResidentField, useAssignableStaff, type ResidentOption } from "./pickers";
import { staffOptionLabel, type HostelChoice } from "./maintenance-form";

/** Log a new complaint. Opens as a scrollable dialog that works on phones. */
export function NewComplaintDialog({
  trigger,
  hostels,
  defaultHostelId,
}: {
  trigger: React.ReactNode;
  hostels: HostelChoice[];
  defaultHostelId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [resident, setResident] = useState<ResidentOption | null>(null);
  const initialHostel = defaultHostelId ?? (hostels.length === 1 ? hostels[0]!.id : "");
  const defaults = {
    hostelId: initialHostel,
    residentId: "",
    category: undefined,
    priority: "MEDIUM" as const,
    title: "",
    description: "",
    assignedStaffId: "",
  };
  const { form, onSubmit, pending } = useActionForm({
    schema: complaintSchema,
    defaultValues: defaults,
    action: createComplaintAction,
    onSuccess: (data) => {
      setOpen(false);
      form.reset(defaults);
      setResident(null);
      router.push(`/operations/complaints/${(data as { id: string }).id}`);
    },
  });
  const c = form.control;
  const hostelId = useWatch({ control: c, name: "hostelId" });
  const staff = useAssignableStaff(open ? hostelId : null);

  return (
    <FormDialog open={open} onOpenChange={setOpen} trigger={trigger} title="Log a complaint" description="Record a resident's complaint and route it to the right person.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {hostels.length > 1 ? (
          <SelectField
            control={c}
            name="hostelId"
            label="Hostel"
            required
            options={hostels.map((h) => ({ value: h.id, label: h.name }))}
            onValueChange={() => {
              form.setValue("residentId", "");
              form.setValue("assignedStaffId", "");
              setResident(null);
            }}
          />
        ) : null}
        <ResidentField control={c} name="residentId" hostelId={hostelId} selected={resident} onSelectedChange={setResident} description="The resident is notified as the complaint progresses." />
        <SelectField control={c} name="category" label="Category" required options={optionsFrom(complaintCategoryLabels)} />
        <TextField control={c} name="title" label="Subject" required placeholder="Hot water not available in the evening" />
        <TextareaField control={c} name="description" label="Details" required rows={4} />
        <PriorityField control={c} name="priority" />
        <SelectField
          control={c}
          name="assignedStaffId"
          label="Assign to"
          allowEmpty="Unassigned"
          placeholder={staff.isLoading ? "Loading staff…" : "Select staff"}
          disabled={!hostelId || staff.isLoading}
          options={(staff.data ?? []).map((s) => ({ value: s.id, label: staffOptionLabel(s) }))}
          description={staff.isError ? staff.error.message : undefined}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Log complaint</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export type ComplaintEditable = {
  id: string;
  hostelId: string;
  category: ComplaintCategory;
  priority: Priority;
  title: string;
  description: string;
  resident: { id: string; firstName: string; lastName: string; residentCode: string } | null;
};

export function EditComplaintDialog({ complaint, trigger }: { complaint: ComplaintEditable; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [resident, setResident] = useState<ResidentOption | null>(
    complaint.resident
      ? { id: complaint.resident.id, name: `${complaint.resident.firstName} ${complaint.resident.lastName}`, code: complaint.resident.residentCode, hostelId: complaint.hostelId }
      : null,
  );
  const { form, onSubmit, pending } = useActionForm({
    schema: complaintEditSchema,
    defaultValues: {
      residentId: complaint.resident?.id ?? "",
      category: complaint.category,
      priority: complaint.priority,
      title: complaint.title,
      description: complaint.description,
    },
    action: (v) => updateComplaintAction(complaint.id, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog open={open} onOpenChange={setOpen} trigger={trigger} title="Edit complaint">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <ResidentField control={c} name="residentId" hostelId={complaint.hostelId} selected={resident} onSelectedChange={setResident} />
        <SelectField control={c} name="category" label="Category" required options={optionsFrom(complaintCategoryLabels)} />
        <TextField control={c} name="title" label="Subject" required />
        <TextareaField control={c} name="description" label="Details" required rows={4} />
        <PriorityField control={c} name="priority" />
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
