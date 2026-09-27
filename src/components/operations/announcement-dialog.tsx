"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { FormGrid, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useOrg } from "@/components/shared/org-context";
import { announcementAudienceLabels, announcementCategoryLabels, optionsFrom } from "@/config/labels";
import type { AnnouncementAudience, AnnouncementCategory } from "@/generated/prisma/enums";
import { announcementSchema, type AnnouncementInput } from "@/lib/validation/operations";
import { createAnnouncementAction, updateAnnouncementAction } from "@/app/(app)/operations/actions";
import { ResidentMultiPicker, type ResidentOption } from "./pickers";
import type { HostelChoice } from "./maintenance-form";

export type AnnouncementEditable = {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  hostelId: string | null;
  isPinned: boolean;
  publishedAt: Date | string;
  expiresAt: Date | string | null;
  recipients: ResidentOption[];
};

const audienceHints: Record<AnnouncementAudience, string> = {
  EVERYONE: "Active residents with portal accounts and team members.",
  RESIDENTS: "Active residents with portal accounts.",
  STAFF: "Team members who can view announcements.",
  SPECIFIC_RESIDENTS: "Only the residents you pick below.",
};

function dayIn(value: Date | string | null, timeZone: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function AnnouncementDialog({
  open,
  onOpenChange,
  hostels,
  allowOrgWide,
  defaultHostelId,
  announcement,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostels: HostelChoice[];
  allowOrgWide: boolean;
  defaultHostelId?: string | null;
  announcement?: AnnouncementEditable;
  trigger?: React.ReactNode;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={announcement ? "Edit announcement" : "New announcement"}
      description={announcement ? "Changes are visible immediately. Recipients are not notified again." : "Residents and staff in the audience are notified when it's published."}
      className="sm:max-w-xl"
    >
      {open ? (
        <AnnouncementForm
          key={announcement?.id ?? "new"}
          hostels={hostels}
          allowOrgWide={allowOrgWide}
          defaultHostelId={defaultHostelId}
          announcement={announcement}
          close={() => onOpenChange(false)}
        />
      ) : null}
    </FormDialog>
  );
}

function AnnouncementForm({
  hostels,
  allowOrgWide,
  defaultHostelId,
  announcement,
  close,
}: {
  hostels: HostelChoice[];
  allowOrgWide: boolean;
  defaultHostelId?: string | null;
  announcement?: AnnouncementEditable;
  close: () => void;
}) {
  const router = useRouter();
  const org = useOrg();
  const [recipients, setRecipients] = useState<ResidentOption[]>(announcement?.recipients ?? []);
  const fallbackHostel = allowOrgWide ? "" : (defaultHostelId ?? hostels[0]?.id ?? "");

  const defaults: AnnouncementInput = announcement
    ? {
        title: announcement.title,
        body: announcement.body,
        category: announcement.category,
        audience: announcement.audience,
        hostelId: announcement.hostelId ?? "",
        residentIds: announcement.recipients.map((r) => r.id),
        isPinned: announcement.isPinned,
        publishDate: dayIn(announcement.publishedAt, org.timezone),
        expiryDate: dayIn(announcement.expiresAt, org.timezone),
      }
    : {
        title: "",
        body: "",
        category: "GENERAL",
        audience: "EVERYONE",
        hostelId: defaultHostelId ?? fallbackHostel,
        residentIds: [],
        isPinned: false,
        publishDate: "",
        expiryDate: "",
      };

  const { form, onSubmit, pending } = useActionForm({
    schema: announcementSchema,
    defaultValues: defaults,
    action: (v) => (announcement ? updateAnnouncementAction(announcement.id, v) : createAnnouncementAction(v)),
    successMessage: announcement ? "Announcement updated" : undefined,
    onSuccess: (data) => {
      if (!announcement) {
        toast.success((data as { scheduled?: boolean }).scheduled ? "Announcement scheduled" : "Announcement published");
      }
      close();
      router.refresh();
    },
  });
  const c = form.control;
  const audience = useWatch({ control: c, name: "audience" }) ?? "EVERYONE";
  const hostelId = useWatch({ control: c, name: "hostelId" });

  const hostelOptions = hostels.map((h) => ({ value: h.id, label: h.name }));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField control={c} name="title" label="Title" required placeholder="Water supply off on Sunday, 10am–2pm" />
      <TextareaField control={c} name="body" label="Message" required rows={5} />
      <FormGrid>
        <SelectField control={c} name="category" label="Category" options={optionsFrom(announcementCategoryLabels)} />
        <SelectField
          control={c}
          name="hostelId"
          label="Target"
          allowEmpty={allowOrgWide ? "Entire organization" : undefined}
          options={hostelOptions}
          placeholder="Select a hostel"
          required={!allowOrgWide}
          onValueChange={() => {
            if (recipients.length) {
              setRecipients([]);
              form.setValue("residentIds", []);
            }
          }}
        />
      </FormGrid>
      <SelectField
        control={c}
        name="audience"
        label="Audience"
        options={optionsFrom(announcementAudienceLabels)}
        description={audienceHints[audience as AnnouncementAudience]}
      />
      {audience === "SPECIFIC_RESIDENTS" ? (
        <Controller
          control={c}
          name="residentIds"
          render={({ fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>
                Residents<span className="text-destructive">*</span>
              </FieldLabel>
              <ResidentMultiPicker
                value={recipients}
                hostelId={hostelId || null}
                invalid={fieldState.invalid}
                onChange={(list) => {
                  setRecipients(list);
                  form.setValue(
                    "residentIds",
                    list.map((r) => r.id),
                    { shouldValidate: form.formState.isSubmitted },
                  );
                }}
              />
              {!hostelId ? <FieldDescription>Searching across all hostels.</FieldDescription> : null}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      ) : null}
      <FormGrid>
        <TextField
          control={c}
          name="publishDate"
          label="Publish on"
          type="date"
          description={announcement ? undefined : "Leave empty to publish now."}
        />
        <TextField control={c} name="expiryDate" label="Show until" type="date" description="Optional — hidden after this day." />
      </FormGrid>
      <SwitchField control={c} name="isPinned" label="Pin to top" description="Pinned announcements stay above others until unpinned or expired." />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{announcement ? "Save changes" : "Publish"}</SubmitButton>
      </div>
    </form>
  );
}
