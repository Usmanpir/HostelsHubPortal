"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileImage, FileText, Plus, Trash2 } from "lucide-react";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field";
import { SelectField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { FormDialog } from "@/components/shared/form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import { optionsFrom, residentDocumentTypeLabels } from "@/config/labels";
import type { ResidentDocumentType } from "@/generated/prisma/enums";
import { residentDocumentSchema } from "@/lib/validation/resident";
import { attachResidentDocumentAction, removeResidentDocumentAction } from "@/app/(app)/residents/actions";

export type ResidentDocumentItem = {
  id: string;
  type: ResidentDocumentType;
  title: string;
  fileId: string;
  createdAt: Date;
  file: { id: string; originalName: string; mimeType: string; size: number };
};

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function DocumentsCard({ residentId, documents, canUpload }: { residentId: string; documents: ResidentDocumentItem[]; canUpload: boolean }) {
  const fmt = useFormatters();
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Documents</h2>
          <p className="text-xs text-muted-foreground">CNIC, admission forms, agreements and clearances. Files are private.</p>
        </div>
        {canUpload ? <UploadDocumentDialog residentId={residentId} /> : null}
      </header>
      {documents.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <ul className="divide-y">
          {documents.map((d) => {
            const Icon = d.file.mimeType.startsWith("image/") ? FileImage : FileText;
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <a href={`/api/files/${d.fileId}`} target="_blank" rel="noopener" className="block truncate text-sm font-medium hover:text-primary">
                    {d.title}
                  </a>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <StatusBadge tone="neutral" dot={false} className="h-4.5 px-1.5 text-[11px]">
                      {residentDocumentTypeLabels[d.type]}
                    </StatusBadge>
                    <span className="truncate">{d.file.originalName}</span>
                    <span>{sizeLabel(d.file.size)}</span>
                    <span>{fmt.date(d.createdAt)}</span>
                  </p>
                </div>
                <Button asChild size="icon-sm" variant="ghost" aria-label={`Download ${d.title}`}>
                  <a href={`/api/files/${d.fileId}?download=1`}>
                    <Download />
                  </a>
                </Button>
                {canUpload ? (
                  <ConfirmAction
                    trigger={
                      <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${d.title}`}>
                        <Trash2 />
                      </Button>
                    }
                    title={`Remove “${d.title}”?`}
                    description="The file is removed from this resident's documents."
                    confirmLabel="Remove"
                    destructive
                    action={() => removeResidentDocumentAction(d.id)}
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

function UploadDocumentDialog({ residentId }: { residentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const { form, onSubmit, pending } = useActionForm({
    schema: residentDocumentSchema,
    defaultValues: { fileId: "", type: "ID_DOCUMENT", title: residentDocumentTypeLabels.ID_DOCUMENT },
    action: (v) => attachResidentDocumentAction(residentId, v),
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
      onOpenChange={setOpen}
      title="Upload document"
      trigger={
        <Button size="sm" variant="outline">
          <Plus />
          Upload
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Controller
          control={c}
          name="fileId"
          render={({ fieldState }) => (
            <div className="grid gap-2">
              <Label>File</Label>
              <FileUpload
                purpose="resident-document"
                value={file}
                onChange={(f) => {
                  setFile(f);
                  form.setValue("fileId", f?.id ?? "", { shouldValidate: !!f });
                  const title = form.getValues("title");
                  if (f && (!title || Object.values(residentDocumentTypeLabels).includes(title))) {
                    form.setValue("title", residentDocumentTypeLabels[form.getValues("type")]);
                  }
                }}
              />
              <FieldError errors={[fieldState.error]} />
            </div>
          )}
        />
        <SelectField
          control={c}
          name="type"
          label="Type"
          options={optionsFrom(residentDocumentTypeLabels)}
          onValueChange={(v) => {
            const title = form.getValues("title");
            if (!title || Object.values(residentDocumentTypeLabels).includes(title)) {
              form.setValue("title", residentDocumentTypeLabels[v as ResidentDocumentType]);
            }
          }}
        />
        <TextField control={c} name="title" label="Title" required />
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
