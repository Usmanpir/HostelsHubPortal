"use client";

import Link from "next/link";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { ArrowRight, MailCheck } from "lucide-react";
import { TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { registerSchema, type SelectablePlanKey } from "@/lib/validation/auth";
import { registerAction, resendVerificationAction } from "@/app/(auth)/actions";
import { AuthHeading } from "./auth-card";
import { PasswordField } from "./password-field";
import { ResendButton } from "./resend-button";

export function RegisterForm({ plan }: { plan?: SelectablePlanKey }) {
  const router = useRouter();
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const { form, onSubmit, pending } = useActionForm({
    schema: registerSchema,
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", plan },
    action: registerAction,
    successMessage: (data) => (data.status === "signed_in" ? "Account created — let's set up your workspace" : ""),
    onSuccess: (data) => {
      if (data.status === "signed_in") {
        router.replace(data.next);
        router.refresh();
      } else if (data.status === "verify_email") {
        setVerifyEmail(data.email);
      } else {
        router.push(`/login?reason=registered&email=${encodeURIComponent(data.email)}`);
      }
    },
  });
  const c = form.control;
  const password = useWatch({ control: c, name: "password" });

  if (verifyEmail) {
    return (
      <div>
        <AuthHeading
          icon={MailCheck}
          title="Check your inbox"
          description={
            <>
              We sent a verification link to <span className="font-medium text-foreground">{verifyEmail}</span>. Open it to
              activate your account, then sign in.
            </>
          }
        />
        <div className="flex flex-col gap-2">
          <Button asChild className="h-10 w-full">
            <Link href={`/login?email=${encodeURIComponent(verifyEmail)}`}>Go to sign in</Link>
          </Button>
          <ResendButton
            send={() => resendVerificationAction({ email: verifyEmail })}
            successMessage="A new verification link is on its way."
          >
            Resend verification email
          </ResendButton>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">The link expires in 24 hours. Check your spam folder if it doesn&apos;t arrive.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <TextField control={c} name="name" label="Full name" autoComplete="name" placeholder="Ayesha Khan" />
      <TextField control={c} name="email" label="Work email" type="email" autoComplete="email" placeholder="you@company.com" />
      <PasswordField control={c} name="password" label="Password" autoComplete="new-password" showStrength />
      <PasswordField control={c} name="confirmPassword" label="Confirm password" autoComplete="new-password" matchValue={password} />
      <SubmitButton pending={pending} pendingText="Creating account…" className="h-10 w-full">
        Create account
        <ArrowRight />
      </SubmitButton>
      <p className="text-center text-xs text-pretty text-muted-foreground">
        Free trial, no credit card required. You can pick or change your plan during setup.
      </p>
    </form>
  );
}
