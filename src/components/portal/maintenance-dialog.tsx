"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { maintenanceCategoryLabels, optionsFrom, priorityLabels } from "@/config/labels";
import { MAX_MAINTENANCE_PHOTOS, portalMaintenanceSchema } from "@/lib/validation/portal";
import { createPortalMaintenanceAction } from "@/app/portal/actions";

export function MaintenanceDialog({
  trigger,
  location,
}: {
  trigger: React.ReactNode;
  /** Human-readable room/bed that will be attached automatically. */
  location: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: portalMaintenanceSchema,
    defaultValues: { category: undefined, priority: "MEDIUM", title: "", description: "", photoFileIds: [] },
    action: (values) => createPortalMaintenanceAction({ ...values, photoFileIds: photos.map((p) => p.id) }),
    onSuccess: (data) => {
      toast.success(`Request ${data.number} submitted`, { description: "Maintenance staff have been notified." });
      setOpen(false);
      setPhotos([]);
      form.reset();
      router.refresh();
    },
  });
  const c = form.control;

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && !pending) setPhotos([]);
      }}
      trigger={trigger}
      title="Report a maintenance issue"
      description={location ? `This request will be linked to ${location}.` : "Describe the problem and where it is."}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormGrid>
          <SelectField control={c} name="category" label="Category" required options={optionsFrom(maintenanceCategoryLabels)} />
          <SelectField control={c} name="priority" label="Priority" options={optionsFrom(priorityLabels)} />
        </FormGrid>
        <TextField control={c} name="title" label="Title" required placeholder="e.g. Ceiling fan not working" />
        <TextareaField control={c} name="description" label="Details" rows={4} placeholder="Anything that helps staff fix it faster" />

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Photos</span>
            <span className="text-xs text-muted-foreground tabular">
              {photos.length}/{MAX_MAINTENANCE_PHOTOS}
            </span>
          </div>
          {photos.length ? (
            <ul className="grid gap-1.5">
              {photos.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <ImageIcon className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{Math.ceil(p.size / 1024)} KB</span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {photos.length < MAX_MAINTENANCE_PHOTOS ? (
            <FileUpload
              purpose="maintenance-photo"
              kind="image"
              value={null}
              onChange={(file) => file && setPhotos((list) => [...list, file])}
              label="Add a photo"
              hint="JPG, PNG or WebP · optional"
              disabled={pending}
            />
          ) : null}
        </div>

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
