"use client";

import { useState } from "react";
import { TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { resendVerificationSchema } from "@/lib/validation/auth";
import { resendVerificationAction } from "@/app/(auth)/actions";
import { FormAlert } from "./auth-card";

export function ResendVerificationForm({ defaultEmail }: { defaultEmail?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const { form, onSubmit, pending } = useActionForm({
    schema: resendVerificationSchema,
    defaultValues: { email: defaultEmail ?? "" },
    action: resendVerificationAction,
    successMessage: () => "",
    onSuccess: () => setMessage("If that account still needs verifying, a new link is on its way. It expires in 24 hours."),
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {message ? <FormAlert tone="success">{message}</FormAlert> : null}
      <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
      <SubmitButton pending={pending} pendingText="Sending…" className="h-10 w-full">
        Send new link
      </SubmitButton>
    </form>
  );
}
