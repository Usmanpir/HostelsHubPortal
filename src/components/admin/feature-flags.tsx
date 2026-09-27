"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/shared/form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { SwitchField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { featureFlagSchema } from "@/lib/validation/admin";
import {
  createFeatureFlagAction,
  deleteFeatureFlagAction,
  removeFlagOverrideAction,
  setFlagOverrideAction,
  toggleFeatureFlagAction,
} from "@/app/admin/actions";
import { OrgPicker, type OrgOption } from "./org-picker";

export type FlagRow = {
  key: string;
  description: string | null;
  enabled: boolean;
  updatedAt: Date;
  overrides: { enabled: boolean; organization: { id: string; name: string; slug: string } }[];
};

export function CreateFlagDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: featureFlagSchema,
    defaultValues: { key: "", description: "", enabled: false },
    action: createFeatureFlagAction,
    onSuccess: () => {
      setOpen(false);
      form.reset();
      router.refresh();
    },
  });
  return (
    <FormDialog open={open} onOpenChange={setOpen} trigger={trigger} title="New feature flag" description="Flags are off for everyone unless enabled globally or per organization.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField control={form.control} name="key" label="Key" required placeholder="e.g. portal.online-payments" />
        <TextField control={form.control} name="description" label="Description" placeholder="What does this flag control?" />
        <SwitchField control={form.control} name="enabled" label="Enabled globally" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Create flag</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

function GlobalToggle({ flag }: { flag: FlagRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = `flag-${flag.key.replace(/\W/g, "-")}`;
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Global
      </Label>
      <Switch
        id={id}
        checked={flag.enabled}
        disabled={pending}
        onCheckedChange={(v) =>
          startTransition(async () => {
            const result = await toggleFeatureFlagAction(flag.key, v);
            if (result.ok) toast.success(result.message ?? "Saved");
            else toast.error(result.error);
            router.refresh();
          })
        }
      />
    </div>
  );
}

function AddOverride({ flagKey, existing }: { flagKey: string; existing: string[] }) {
  const [open, setOpen] = useState(false);
  const [org, setOrg] = useState<OrgOption | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pickerId = `override-org-${flagKey.replace(/\W/g, "-")}`;

  const save = () =>
    startTransition(async () => {
      if (!org) return;
      const result = await setFlagOverrideAction(flagKey, { organizationId: org.id, enabled });
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setOpen(false);
        setOrg(null);
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="outline">
          <Plus />
          Override
        </Button>
      }
      title="Organization override"
      description={`Force “${flagKey}” on or off for one organization, regardless of the global value.`}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor={pickerId}>Organization</Label>
          <OrgPicker id={pickerId} value={org} onChange={setOrg} />
          {org && existing.includes(org.id) ? (
            <p className="text-xs text-muted-foreground">This organization already has an override — saving replaces it.</p>
          ) : null}
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label htmlFor={`${pickerId}-enabled`}>Enabled for this organization</Label>
          <Switch id={`${pickerId}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={!org || pending}>
            {pending ? <Spinner /> : null}
            Save override
          </Button>
        </div>
      </div>
    </FormDialog>
  );
}

export function FeatureFlagList({ flags }: { flags: FlagRow[] }) {
  if (flags.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="No feature flags"
        description="Create a flag to roll features out gradually, then enable it globally or for specific organizations."
        action={
          <CreateFlagDialog
            trigger={
              <Button>
                <Plus />
                New flag
              </Button>
            }
          />
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {flags.map((flag) => (
        <section key={flag.key} className="rounded-xl border bg-card">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-sm font-semibold">
                <Flag className="size-3.5 text-muted-foreground" />
                {flag.key}
              </p>
              {flag.description ? <p className="mt-0.5 text-sm text-muted-foreground">{flag.description}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <GlobalToggle flag={flag} />
              <AddOverride flagKey={flag.key} existing={flag.overrides.map((o) => o.organization.id)} />
              <ConfirmAction
                trigger={
                  <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${flag.key}`}>
                    <Trash2 />
                  </Button>
                }
                title={`Delete ${flag.key}?`}
                description={`Its ${flag.overrides.length} organization override(s) are removed too. Code that checks this flag will treat it as off.`}
                confirmLabel="Delete flag"
                destructive
                action={() => deleteFeatureFlagAction(flag.key)}
              />
            </div>
          </header>
          {flag.overrides.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">No organization overrides — every organization uses the global value.</p>
          ) : (
            <ul className="divide-y">
              {flag.overrides.map((o) => (
                <li key={o.organization.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{o.organization.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{o.organization.slug}</p>
                  </div>
                  <StatusBadge tone={o.enabled ? "success" : "neutral"}>{o.enabled ? "Forced on" : "Forced off"}</StatusBadge>
                  <ConfirmAction
                    trigger={
                      <Button size="icon-xs" variant="ghost" aria-label={`Remove override for ${o.organization.name}`}>
                        <X />
                      </Button>
                    }
                    title="Remove override?"
                    description={`${o.organization.name} will follow the global value (${flag.enabled ? "on" : "off"}).`}
                    confirmLabel="Remove"
                    action={() => removeFlagOverrideAction(flag.key, o.organization.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
