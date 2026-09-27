"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut } from "lucide-react";
import { toast } from "sonner";
import { TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { inviteSignupSchema } from "@/lib/validation/auth";
import { acceptInvitationAction, inviteSignupAction, switchAccountAction } from "@/app/invite/actions";
import { PasswordField } from "./password-field";

function useNavigate() {
  const router = useRouter();
  return (next: string) => {
    router.replace(next);
    router.refresh();
  };
}

export function AcceptInvitationButton({ token }: { token: string }) {
  const navigate = useNavigate();
  const [pending, startTransition] = useTransition();
  const accept = () =>
    startTransition(async () => {
      try {
        const result = await acceptInvitationAction(token);
        if (result.ok) {
          toast.success(result.message ?? "Invitation accepted");
          navigate(result.data.next);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });
  return (
    <Button className="h-10 w-full" onClick={accept} disabled={pending}>
      {pending ? <Spinner /> : null}
      Accept invitation
      {pending ? null : <ArrowRight />}
    </Button>
  );
}

export function SwitchAccountButton({ token, email }: { token: string; email: string }) {
  const navigate = useNavigate();
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      try {
        const result = await switchAccountAction(token, email);
        if (result.ok) navigate(result.data.next);
        else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });
  return (
    <Button variant="outline" className="h-10 w-full" onClick={run} disabled={pending}>
      {pending ? <Spinner /> : <LogOut />}
      Sign out and use {email}
    </Button>
  );
}

export function InviteSignupForm({ token, email }: { token: string; email: string }) {
  const navigate = useNavigate();
  const { form, onSubmit, pending } = useActionForm({
    schema: inviteSignupSchema,
    defaultValues: { token, name: "", password: "", confirmPassword: "" },
    action: inviteSignupAction,
    onSuccess: (data) => navigate(data.next),
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Field>
        <FieldLabel htmlFor="invite-email">Email</FieldLabel>
        <Input id="invite-email" type="email" value={email} readOnly disabled autoComplete="username" />
        <FieldDescription>You&apos;ll sign in with the address the invitation was sent to.</FieldDescription>
      </Field>
      <TextField control={form.control} name="name" label="Full name" autoComplete="name" />
      <PasswordField control={form.control} name="password" label="Password" autoComplete="new-password" showStrength />
      <PasswordField control={form.control} name="confirmPassword" label="Confirm password" autoComplete="new-password" />
      <SubmitButton pending={pending} pendingText="Creating account…" className="h-10 w-full">
        Create account and join
        <ArrowRight />
      </SubmitButton>
    </form>
  );
}
