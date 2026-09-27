"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { resetPasswordAction } from "@/app/(auth)/actions";
import { AuthHeading } from "./auth-card";
import { PasswordField } from "./password-field";

export function ResetPasswordForm({ token, email, mode }: { token: string; email: string; mode: "set" | "reset" }) {
  const [done, setDone] = useState<null | { firstTime: boolean }>(null);
  const { form, onSubmit, pending } = useActionForm({
    schema: resetPasswordSchema,
    defaultValues: { token, password: "", confirmPassword: "" },
    action: resetPasswordAction,
    successMessage: () => "",
    onSuccess: (data) => setDone(data),
  });

  if (done) {
    const reason = done.firstTime ? "password-set" : "password-reset";
    return (
      <div>
        <AuthHeading
          icon={CheckCircle2}
          title={done.firstTime ? "Your password is set" : "Password updated"}
          description={
            done.firstTime
              ? "You're all set. Sign in with your email and new password."
              : "For your security we've signed you out on every device. Sign in with your new password."
          }
        />
        <Button asChild className="h-10 w-full">
          <Link href={`/login?reason=${reason}&email=${encodeURIComponent(email)}`}>Continue to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <AuthHeading
        title={mode === "set" ? "Set your password" : "Choose a new password"}
        description={
          <>
            {mode === "set" ? "Create a password for " : "Resetting the password for "}
            <span className="font-medium text-foreground">{email}</span>.
          </>
        }
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {/* Helps password managers associate the new password with the account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <PasswordField control={form.control} name="password" label="New password" autoComplete="new-password" showStrength autoFocus />
        <PasswordField control={form.control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        <SubmitButton pending={pending} pendingText="Saving…" className="h-10 w-full">
          {mode === "set" ? "Set password" : "Update password"}
        </SubmitButton>
      </form>
    </>
  );
}
