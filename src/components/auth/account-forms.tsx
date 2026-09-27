"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { BadgeCheck, Building2, Check, MailWarning, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { changePasswordSchema, profileSchema } from "@/lib/validation/auth";
import { changePasswordAction, resendMyVerificationAction, updateProfileAction } from "@/app/(app)/account/actions";
import { setActiveOrganizationAction } from "@/app/(app)/shell-actions";
import { PasswordField } from "./password-field";

export function ProfileForm({
  name,
  phone,
  email,
  emailVerified,
}: {
  name: string;
  phone: string | null;
  email: string;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [resending, startResend] = useTransition();
  const { form, onSubmit, pending } = useActionForm({
    schema: profileSchema,
    defaultValues: { name, phone: phone ?? "" },
    action: updateProfileAction,
    onSuccess: () => router.refresh(),
  });

  const resend = () =>
    startResend(async () => {
      try {
        const result = await resendMyVerificationAction();
        if (result.ok) toast.success(result.message ?? "Verification email sent");
        else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label="Full name" autoComplete="name" required />
        <TextField control={form.control} name="phone" label="Phone" type="tel" autoComplete="tel" />
      </div>
      <Field>
        <FieldLabel htmlFor="account-email">Email</FieldLabel>
        <Input id="account-email" value={email} readOnly disabled />
        <FieldDescription className="flex flex-wrap items-center gap-2">
          {emailVerified ? (
            <span className="inline-flex items-center gap-1 text-success">
              <BadgeCheck className="size-3.5" /> Verified
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 text-warning">
                <MailWarning className="size-3.5" /> Not verified
              </span>
              <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={resend} disabled={resending}>
                {resending ? <Spinner /> : null}
                Send verification email
              </Button>
            </>
          )}
          <span>Contact your organization owner to change the email you sign in with.</span>
        </FieldDescription>
      </Field>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Save profile</SubmitButton>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const { form, onSubmit, pending } = useActionForm({
    schema: changePasswordSchema,
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    action: changePasswordAction,
    successMessage: "Password changed. Please sign in again.",
    onSuccess: (data) => {
      // Full reload: the session cookie was cleared on the server.
      window.location.assign(data.next);
    },
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <PasswordField control={form.control} name="currentPassword" label="Current password" autoComplete="current-password" />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField control={form.control} name="newPassword" label="New password" autoComplete="new-password" showStrength />
        <PasswordField control={form.control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">You&apos;ll be signed out on all devices, including this one.</p>
        <SubmitButton pending={pending} pendingText="Updating…">
          Change password
        </SubmitButton>
      </div>
    </form>
  );
}

const noopSubscribe = () => () => {};

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemePreference() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the stored theme after hydration.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const current = mounted ? (theme ?? "system") : null;

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
      {THEMES.map(({ value, label, icon: Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active && "border-primary bg-primary/5 ring-3 ring-primary/15",
            )}
          >
            <ThemeSwatch value={value} />
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Icon className="size-3.5" />
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeSwatch({ value }: { value: "light" | "dark" | "system" }) {
  const light = (
    <span className="flex h-full flex-1 flex-col gap-1 bg-white p-1.5">
      <span className="h-1.5 w-2/3 rounded-full bg-zinc-300" />
      <span className="h-1.5 w-1/2 rounded-full bg-zinc-200" />
    </span>
  );
  const dark = (
    <span className="flex h-full flex-1 flex-col gap-1 bg-zinc-900 p-1.5">
      <span className="h-1.5 w-2/3 rounded-full bg-zinc-600" />
      <span className="h-1.5 w-1/2 rounded-full bg-zinc-700" />
    </span>
  );
  return (
    <span aria-hidden className="flex h-12 w-full overflow-hidden rounded-lg border">
      {value === "light" ? light : value === "dark" ? dark : (
        <>
          {light}
          {dark}
        </>
      )}
    </span>
  );
}

export type AccountOrganization = {
  id: string;
  name: string;
  roleName: string;
  isOwner: boolean;
  location: string | null;
  hostelAccess: string;
};

export function OrganizationList({ organizations, activeId }: { organizations: AccountOrganization[]; activeId: string }) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const open = (id: string) => {
    setSwitching(id);
    startTransition(async () => {
      try {
        const result = await setActiveOrganizationAction(id);
        if (result.ok) {
          router.push("/dashboard");
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Please try again.");
      } finally {
        setSwitching(null);
      }
    });
  };

  return (
    <ul className="divide-y rounded-xl border">
      {organizations.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className="truncate">{o.name}</span>
              {o.isOwner ? <StatusBadge tone="accent">Owner</StatusBadge> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {o.roleName} · {o.hostelAccess}
              {o.location ? ` · ${o.location}` : ""}
            </p>
          </div>
          {o.id === activeId ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <Check className="size-3.5" /> Current
            </span>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => open(o.id)} disabled={switching !== null}>
              {switching === o.id ? <Spinner /> : null}
              Switch
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
