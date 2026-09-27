"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, ImageIcon, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { SelectField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters } from "@/components/shared/org-context";
import { optionsFrom, staffDocumentTypeLabels } from "@/config/labels";
import type { StaffDocumentType } from "@/generated/prisma/enums";
import { staffDocumentSchema } from "@/lib/validation/staff";
import { addStaffDocumentAction, removeStaffDocumentAction } from "@/app/(app)/staff/actions";

export type StaffDocumentRow = {
  id: string;
  type: StaffDocumentType;
  title: string;
  createdAt: Date;
  file: { id: string; originalName: string; mimeType: string; size: number };
};

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function StaffDocuments({ staffId, documents, canManage }: { staffId: string; documents: StaffDocumentRow[]; canManage: boolean }) {
  const fmt = useFormatters();
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Documents</h2>
        {canManage ? <AddDocumentDialog staffId={staffId} /> : null}
      </header>
      {documents.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No documents uploaded yet — add a CNIC copy, contract or certificates.</p>
      ) : (
        <ul className="divide-y">
          {documents.map((d) => {
            const Icon = d.file.mimeType.startsWith("image/") ? ImageIcon : FileText;
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <a href={`/api/files/${d.file.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:text-primary">
                    {d.title}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    {staffDocumentTypeLabels[d.type]} · {formatSize(d.file.size)} · {fmt.date(d.createdAt)}
                  </p>
                </div>
                <Button asChild variant="ghost" size="icon-sm" aria-label={`Download ${d.title}`}>
                  <a href={`/api/files/${d.file.id}?download=1`}>
                    <Download />
                  </a>
                </Button>
                {canManage ? (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Remove ${d.title}`}>
                        <Trash2 />
                      </Button>
                    }
                    title={`Remove "${d.title}"?`}
                    description="The file will no longer be available from this profile."
                    confirmLabel="Remove"
                    destructive
                    action={removeStaffDocumentAction.bind(null, staffId, d.id)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddDocumentDialog({ staffId }: { staffId: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: staffDocumentSchema,
    defaultValues: { fileId: "", type: "ID_DOCUMENT", title: "" },
    action: (v) => addStaffDocumentAction(staffId, v),
    onSuccess: () => {
      setOpen(false);
      setFile(null);
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
        if (!o) {
          setFile(null);
          form.reset();
        }
      }}
      trigger={
        <Button size="sm" variant="outline">
          <Plus />
          Upload
        </Button>
      }
      title="Upload document"
      description="Files are stored privately and only visible to staff managers."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field data-invalid={!!form.formState.errors.fileId}>
          <FieldLabel>
            File<span className="text-destructive">*</span>
          </FieldLabel>
          <FileUpload
            purpose="staff-document"
            value={file}
            onChange={(f) => {
              setFile(f);
              form.setValue("fileId", f?.id ?? "", { shouldValidate: true });
              if (f && !form.getValues("title")) form.setValue("title", f.name.replace(/\.[^.]+$/, ""));
            }}
          />
          <FieldError errors={[form.formState.errors.fileId]} />
        </Field>
        <SelectField control={c} name="type" label="Type" required options={optionsFrom(staffDocumentTypeLabels)} />
        <TextField control={c} name="title" label="Title" required placeholder="CNIC (front & back)" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save document</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
