"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { forgotPasswordAction } from "@/app/(auth)/actions";
import { AuthHeading, FormAlert } from "./auth-card";

export function ForgotPasswordForm({ defaultEmail }: { defaultEmail?: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const { form, onSubmit, pending } = useActionForm({
    schema: forgotPasswordSchema,
    defaultValues: { email: defaultEmail ?? "" },
    action: forgotPasswordAction,
    successMessage: () => "",
    onSuccess: () => setSent(form.getValues("email")),
  });

  if (sent) {
    return (
      <div>
        <AuthHeading
          icon={MailCheck}
          title="Check your email"
          description={
            <>
              If an account exists for <span className="font-medium text-foreground">{sent}</span>, we&apos;ve sent a link
              to reset your password. It expires in 1 hour.
            </>
          }
        />
        <div className="flex flex-col gap-2">
          <Button asChild className="h-10 w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setSent(null)}>
            Use a different email
          </Button>
        </div>
        <FormAlert tone="info" className="mt-6">
          Didn&apos;t get it? Check your spam folder, or wait a minute and try again.
        </FormAlert>
      </div>
    );
  }

  return (
    <>
      <AuthHeading title="Forgot your password?" description="Enter the email you sign in with and we'll send you a reset link." />
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" placeholder="you@company.com" />
        <SubmitButton pending={pending} pendingText="Sending…" className="h-10 w-full">
          Send reset link
        </SubmitButton>
      </form>
      <Button asChild variant="ghost" className="mt-6 w-full text-muted-foreground">
        <Link href="/login">
          <ArrowLeft />
          Back to sign in
        </Link>
      </Button>
    </>
  );
}
