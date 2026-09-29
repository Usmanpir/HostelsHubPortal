"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import { ArrowRight, Check, Copy, MailPlus, Send } from "lucide-react";
import { toast } from "sonner";
import { SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { staffInviteSchema } from "@/lib/validation/auth";
import { inviteStaffAction } from "@/app/onboarding/actions";
import { StepCard, StepFooter } from "./wizard-chrome";

type Role = { id: string; name: string; description: string | null; defaultAllHostels: boolean };
type Pending = { id: string; email: string; roleName: string; createdAt: Date | string };

export function TeamStep({
  roles,
  hostels,
  pendingInvites,
  propertiesLabel = "Hostels",
}: {
  /** Plural noun for properties ("Hostels" / "Properties"). */
  propertiesLabel?: string;
  roles: Role[];
  hostels: { id: string; name: string }[];
  pendingInvites: Pending[];
}) {
  const router = useRouter();
  const [sent, setSent] = useState<{ email: string; inviteUrl: string }[]>([]);
  const firstRole = roles[0];
  const defaults = {
    email: "",
    roleId: firstRole?.id ?? "",
    allHostels: firstRole?.defaultAllHostels ?? true,
    hostelIds: hostels.length === 1 ? [hostels[0]!.id] : [],
  };
  const { form, onSubmit, pending } = useActionForm({
    schema: staffInviteSchema,
    defaultValues: defaults,
    action: inviteStaffAction,
    successMessage: (data) => `Invitation sent to ${data.email}`,
    onSuccess: (data) => {
      setSent((prev) => [data, ...prev]);
      form.reset({ ...defaults, roleId: form.getValues("roleId"), allHostels: form.getValues("allHostels"), hostelIds: form.getValues("hostelIds") });
      router.refresh();
    },
  });
  const c = form.control;
  const allHostels = useWatch({ control: c, name: "allHostels" });
  const roleId = useWatch({ control: c, name: "roleId" });
  const role = roles.find((r) => r.id === roleId);
  const sentEmails = new Set(sent.map((s) => s.email));
  const others = pendingInvites.filter((p) => !sentEmails.has(p.email));

  return (
    <StepCard
      eyebrow="Step 6 · Optional"
      title="Invite your team"
      description="Give managers, wardens and accountants their own login. Each role only sees what it needs."
    >
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <TextField control={c} name="email" label="Email address" type="email" autoComplete="off" placeholder="manager@company.com" required />
          <SelectField
            control={c}
            name="roleId"
            label="Role"
            required
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            onValueChange={(v) => {
              const next = roles.find((r) => r.id === v);
              if (next) form.setValue("allHostels", next.defaultAllHostels);
            }}
          />
        </div>
        {role?.description ? <p className="-mt-2 text-xs text-muted-foreground">{role.description}</p> : null}
        <SwitchField
          control={c}
          name="allHostels" label={`Access to all ${propertiesLabel.toLowerCase()}`}
          description={`Includes ${propertiesLabel.toLowerCase()} you add later.`}
        />
        {!allHostels ? (
          <Controller
            control={c}
            name="hostelIds"
            render={({ field, fieldState }) => {
              const value = (field.value as string[] | undefined) ?? [];
              return (
                <FieldSet>
                  <FieldLegend variant="label">{propertiesLabel} they can access</FieldLegend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {hostels.map((h) => {
                      const checked = value.includes(h.id);
                      return (
                        <label key={h.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => field.onChange(v === true ? [...value, h.id] : value.filter((id) => id !== h.id))}
                          />
                          {h.name}
                        </label>
                      );
                    })}
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </FieldSet>
              );
            }}
          />
        ) : null}
        <div className="flex justify-end">
          <SubmitButton pending={pending} pendingText="Sending…" variant="outline">
            <Send />
            Send invitation
          </SubmitButton>
        </div>
      </form>

      {sent.length || others.length ? (
        <div className="mt-6 grid gap-2">
          <h2 className="text-sm font-medium">Invitations</h2>
          <ul className="grid gap-2">
            {sent.map((s) => (
              <SentInvite key={s.inviteUrl} email={s.email} url={s.inviteUrl} />
            ))}
            {others.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <MailPlus className="size-4 text-muted-foreground" />
                <span className="font-medium">{p.email}</span>
                <span className="text-muted-foreground">· {p.roleName}</span>
                <span className="ms-auto text-xs text-muted-foreground">Sent {formatDate(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <StepFooter step={6} skipTo={sent.length || others.length ? undefined : 7}>
        {sent.length || others.length ? (
          <Button asChild className="h-9 px-4">
            <Link href="/onboarding?step=7">
              Continue
              <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </StepFooter>
    </StepCard>
  );
}

function SentInvite({ email, url }: { email: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically — select the link and copy it.");
    }
  };
  return (
    <li className="grid gap-2 rounded-lg border bg-success-soft/40 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Check className="size-4 text-success" />
        <span className="font-medium">{email}</span>
        <span className="text-muted-foreground">· invitation emailed</span>
      </div>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label={`Invitation link for ${email}`} className="h-8 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </li>
  );
}
