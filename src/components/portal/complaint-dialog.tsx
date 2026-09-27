"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { complaintCategoryLabels, optionsFrom, priorityLabels } from "@/config/labels";
import { portalComplaintSchema } from "@/lib/validation/portal";
import { createPortalComplaintAction } from "@/app/portal/actions";

export function ComplaintDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: portalComplaintSchema,
    defaultValues: { category: undefined, priority: "MEDIUM", title: "", description: "" },
    action: createPortalComplaintAction,
    onSuccess: (data) => {
      toast.success(`Complaint ${data.number} submitted`, { description: "The hostel team has been notified." });
      setOpen(false);
      form.reset();
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="New complaint"
      description="Tell the hostel team what's wrong. You'll be notified when it's updated."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormGrid>
          <SelectField control={c} name="category" label="Category" required options={optionsFrom(complaintCategoryLabels)} />
          <SelectField control={c} name="priority" label="Priority" options={optionsFrom(priorityLabels)} />
        </FormGrid>
        <TextField control={c} name="title" label="Title" required placeholder="e.g. Water heater not working" />
        <TextareaField
          control={c}
          name="description"
          label="Description"
          required
          rows={5}
          placeholder="What happened, where and when?"
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingText="Submitting…">
            Submit complaint
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
