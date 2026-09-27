"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { optionsFrom, residentRequestTypeLabels, roomTypeLabels } from "@/config/labels";
import { portalRequestSchema } from "@/lib/validation/portal";
import { createPortalRequestAction } from "@/app/portal/actions";
import type { ResidentRequestType } from "@/generated/prisma/enums";

const TYPE_HINTS: Record<ResidentRequestType, string> = {
  ROOM_CHANGE: "Ask to move to a different room. The office will review availability.",
  LEAVE: "Let the office know you'll be away from the hostel.",
  OTHER: "Anything else you need from the hostel office.",
};

export function RequestDialog({ trigger, defaultType = "ROOM_CHANGE" }: { trigger: React.ReactNode; defaultType?: ResidentRequestType }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: portalRequestSchema,
    defaultValues: { type: defaultType, subject: "", details: "", preferredRoomType: "", startDate: "", endDate: "" },
    action: createPortalRequestAction,
    onSuccess: () => {
      setOpen(false);
      form.reset();
      router.refresh();
    },
  });
  const c = form.control;
  const type = (useWatch({ control: c, name: "type" }) ?? defaultType) as ResidentRequestType;

  return (
    <FormDialog open={open} onOpenChange={setOpen} trigger={trigger} title="New request" description={TYPE_HINTS[type]}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField
          control={c}
          name="type"
          label="Request type"
          required
          options={optionsFrom(residentRequestTypeLabels)}
          onValueChange={() => form.clearErrors()}
        />
        {type === "ROOM_CHANGE" ? (
          <SelectField
            control={c}
            name="preferredRoomType"
            label="Preferred room type"
            allowEmpty="No preference"
            options={optionsFrom(roomTypeLabels)}
          />
        ) : null}
        {type === "LEAVE" ? (
          <FormGrid>
            <TextField control={c} name="startDate" label="From" type="date" required />
            <TextField control={c} name="endDate" label="Until" type="date" required />
          </FormGrid>
        ) : null}
        {type === "OTHER" ? <TextField control={c} name="subject" label="Subject" required placeholder="What is this about?" /> : null}
        <TextareaField
          control={c}
          name="details"
          label={type === "OTHER" ? "Details" : "Reason"}
          required
          rows={4}
          placeholder={type === "LEAVE" ? "e.g. Going home for the holidays" : type === "ROOM_CHANGE" ? "Why would you like to move?" : "Tell us more"}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingText="Submitting…">
            Submit request
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
