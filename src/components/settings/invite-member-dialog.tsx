"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Check, CheckCircle2, Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { inviteMemberSchema } from "@/lib/validation/settings";
import { inviteMemberAction } from "@/app/(app)/settings/actions";
import { HostelAccessPicker, type HostelOption } from "./hostel-access-picker";

export type RoleOption = { id: string; name: string; description: string | null; defaultAllHostels: boolean; isOwnerRole: boolean };

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically. Select the link and copy it manually.");
    }
  };
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" variant="outline" onClick={copy} className="shrink-0">
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function InviteMemberDialog({ roles, hostels }: { roles: RoleOption[]; hostels: HostelOption[] }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ email: string; inviteUrl: string } | null>(null);

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResult(null);
      }}
      trigger={
        <Button>
          <UserPlus />
          Invite member
        </Button>
      }
      title={result ? "Invitation sent" : "Invite a team member"}
      description={result ? undefined : "They'll get an email with a link to join. Invitations expire after 7 days."}
    >
      {!open ? null : result ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg bg-success-soft p-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <p>
              We emailed an invitation to <span className="font-medium">{result.email}</span>. You can also share this link
              with them directly — it only works for that email address.
            </p>
          </div>
          <CopyField value={result.inviteUrl} label="Invitation link" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setResult(null)}>
              Invite another
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <InviteForm roles={roles} hostels={hostels} onCancel={() => setOpen(false)} onInvited={setResult} />
      )}
    </FormDialog>
  );
}

function InviteForm({
  roles,
  hostels,
  onCancel,
  onInvited,
}: {
  roles: RoleOption[];
  hostels: HostelOption[];
  onCancel: () => void;
  onInvited: (result: { email: string; inviteUrl: string }) => void;
}) {
  const router = useRouter();
  const firstRole = roles.find((r) => !r.isOwnerRole) ?? roles[0];
  const { form, onSubmit, pending } = useActionForm({
    schema: inviteMemberSchema,
    defaultValues: {
      email: "",
      roleId: firstRole?.id ?? "",
      allHostels: firstRole?.defaultAllHostels ?? false,
      hostelIds: [],
    },
    action: (values) => inviteMemberAction(values),
    onSuccess: (data) => {
      onInvited({ email: form.getValues("email"), inviteUrl: data.inviteUrl });
      router.refresh();
    },
  });
  const c = form.control;
  const [roleId, allHostels, hostelIds] = useWatch({ control: c, name: ["roleId", "allHostels", "hostelIds"] });
  const role = roles.find((r) => r.id === roleId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField control={c} name="email" label="Email address" type="email" required autoComplete="off" placeholder="name@example.com" />
      <SelectField
        control={c}
        name="roleId"
        label="Role"
        required
        options={roles.map((r) => ({ value: r.id, label: r.name }))}
        onValueChange={(id) => {
          const next = roles.find((r) => r.id === id);
          if (next) form.setValue("allHostels", next.isOwnerRole || next.defaultAllHostels, { shouldDirty: true });
        }}
        description={role?.description ?? undefined}
      />
      {role?.isOwnerRole ? (
        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          Owners have every permission and access to all hostels.
        </p>
      ) : (
        <HostelAccessPicker
          hostels={hostels}
          value={{ allHostels: !!allHostels, hostelIds: hostelIds ?? [] }}
          onChange={(v) => {
            form.setValue("allHostels", v.allHostels, { shouldDirty: true });
            form.setValue("hostelIds", v.hostelIds, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
          }}
          error={form.formState.errors.hostelIds?.message}
          disabled={pending}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingText="Sending…">
          Send invitation
        </SubmitButton>
      </div>
    </form>
  );
}
