"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/shared/form-dialog";
import { TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { systemSettingSchema } from "@/lib/validation/admin";
import { formatDateTime } from "@/lib/format";
import { deleteSystemSettingAction, upsertSystemSettingAction } from "@/app/admin/actions";

export type SettingRow = { key: string; value: string; updatedAt: Date; description: string | null };
export type SettingSuggestion = { key: string; description: string; example: string };

export function SettingDialog({
  trigger,
  initial,
  description,
}: {
  trigger: React.ReactNode;
  initial?: { key: string; value: string };
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const editing = !!initial?.value && !!initial.key;
  const { form, onSubmit, pending } = useActionForm({
    schema: systemSettingSchema,
    defaultValues: { key: initial?.key ?? "", value: initial?.value ?? "" },
    action: upsertSystemSettingAction,
    onSuccess: () => {
      setOpen(false);
      if (!initial) form.reset();
      router.refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ key: initial?.key ?? "", value: initial?.value ?? "" });
      }}
      trigger={trigger}
      title={editing ? `Edit ${initial?.key}` : "Add setting"}
      description={description ?? "Values are JSON: true, 42, \"text\", [1,2] or {\"a\":1}."}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField control={form.control} name="key" label="Key" required disabled={!!initial?.key} placeholder="e.g. signups.enabled" />
        <TextareaField control={form.control} name="value" label="Value (JSON)" required rows={6} placeholder='e.g. true or "Maintenance tonight"' />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save setting</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export function SystemSettingsEditor({ settings, suggestions }: { settings: SettingRow[]; suggestions: SettingSuggestion[] }) {
  return (
    <div className="flex flex-col gap-4">
      {suggestions.length ? (
        <section className="rounded-xl border border-dashed bg-card p-4">
          <h2 className="text-sm font-semibold">Well-known settings not set yet</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.key} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium">{s.key}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
                <SettingDialog
                  initial={{ key: s.key, value: s.example }}
                  description={s.description}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Plus />
                      Set
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {settings.length === 0 ? (
        <EmptyState icon={Settings2} title="No settings stored" description="Platform defaults apply until a setting is saved here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {settings.map((s) => (
            <li key={s.key} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">{s.key}</p>
                  {s.description ? <p className="text-xs text-muted-foreground">{s.description}</p> : null}
                </div>
                <div className="flex items-center gap-1">
                  <SettingDialog
                    initial={{ key: s.key, value: s.value }}
                    description={s.description ?? undefined}
                    trigger={
                      <Button size="sm" variant="outline">
                        <Pencil />
                        Edit
                      </Button>
                    }
                  />
                  <ConfirmAction
                    trigger={
                      <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${s.key}`}>
                        <Trash2 />
                      </Button>
                    }
                    title={`Delete ${s.key}?`}
                    description="Code reading this setting falls back to its built-in default."
                    confirmLabel="Delete"
                    destructive
                    action={() => deleteSystemSettingAction(s.key)}
                  />
                </div>
              </div>
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap break-all">{s.value}</pre>
              <p className="mt-2 text-xs text-muted-foreground">Updated {formatDateTime(s.updatedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
