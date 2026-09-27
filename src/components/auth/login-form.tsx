"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { loginAction, resendVerificationAction, type LoginFailureReason } from "@/app/(auth)/actions";
import { FormAlert } from "./auth-card";
import { PasswordField } from "./password-field";

export function LoginForm({ callbackUrl, defaultEmail }: { callbackUrl?: string; defaultEmail?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resending, startResend] = useTransition();
  const [failure, setFailure] = useState<{ reason: LoginFailureReason; message: string } | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: defaultEmail ?? "", password: "", callbackUrl },
    mode: "onTouched",
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setFailure(null);
      try {
        const result = await loginAction({ ...values, callbackUrl });
        if (result.ok) {
          router.replace(result.next);
          router.refresh();
          return;
        }
        setFailure({ reason: result.reason, message: result.error });
        form.setValue("password", "");
        form.setFocus("password");
      } catch {
        setFailure({ reason: "unknown", message: "Could not reach the server. Check your connection and try again." });
      }
    }),
  );

  const resend = () =>
    startResend(async () => {
      try {
        const result = await resendVerificationAction({ email: form.getValues("email") });
        if (result.ok) toast.success(result.message ?? "Verification email sent.");
        else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {failure ? (
        <FormAlert>
          <p>{failure.message}</p>
          {failure.reason === "account_locked" ? (
            <p className="mt-1">
              <Link href="/forgot-password">Reset your password</Link>
            </p>
          ) : null}
          {failure.reason === "email_not_verified" ? (
            <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0 text-danger" onClick={resend} disabled={resending}>
              {resending ? <Spinner /> : null}
              Resend verification email
            </Button>
          ) : null}
        </FormAlert>
      ) : null}
      <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" placeholder="you@company.com" />
      <PasswordField
        control={form.control}
        name="password"
        label="Password"
        labelAction={
          <Link href="/forgot-password" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        }
      />
      <SubmitButton pending={pending} pendingText="Signing in…" className="h-10 w-full">
        Sign in
        <ArrowRight />
      </SubmitButton>
    </form>
  );
}
