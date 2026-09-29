"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";
import { publicInquirySchema, type PublicInquiryInput } from "@/lib/validation/public";

const CONTACT_OPTIONS = [
  { value: "PHONE", label: "Phone call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
];

export function InquiryForm({
  orgSlug,
  listingSlug,
  listingTitle,
  orgName,
  action,
}: {
  orgSlug: string;
  listingSlug: string;
  listingTitle: string;
  orgName: string;
  action: (input: PublicInquiryInput) => Promise<ActionResult<null>>;
}) {
  const [sent, setSent] = useState(false);
  // When the form became interactive; the server rejects instant (scripted) submissions.
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const defaultValues: PublicInquiryInput = {
    orgSlug,
    listingSlug,
    name: "",
    phone: "",
    email: "",
    preferredContact: "PHONE",
    message: `Hi, I'm interested in "${listingTitle}". Is it still available?`,
    website: "",
  };
  const { form, onSubmit, pending } = useActionForm({
    schema: publicInquirySchema,
    defaultValues,
    action: (values) => action({ ...values, startedAt: startedAt.current }),
    successMessage: () => "",
    onSuccess: () => setSent(true),
  });
  const c = form.control;

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <p className="text-lg font-semibold">Message sent</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Thanks! {orgName} has received your inquiry and will get back to you soon.
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            form.reset(defaultValues);
            startedAt.current = Date.now();
            setSent(false);
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative grid gap-4" noValidate aria-label="Ask about this property">
      <TextField control={c} name="name" label="Your name" autoComplete="name" required />
      <FormGrid>
        <TextField control={c} name="phone" label="Phone" type="tel" autoComplete="tel" inputMode="tel" required />
        <TextField control={c} name="email" label="Email" type="email" autoComplete="email" />
      </FormGrid>
      <SelectField control={c} name="preferredContact" label="How should we contact you?" options={CONTACT_OPTIONS} required />
      <TextareaField control={c} name="message" label="Message" rows={4} />
      {/* Honeypot: hidden from people and assistive tech, filled in by bots. */}
      <div aria-hidden className="absolute -inset-s-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="inquiry-website">Website</label>
        <input id="inquiry-website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <SubmitButton pending={pending} pendingText="Sending…" className="h-10">
        <Send />
        Send inquiry
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        Your details are shared only with {orgName} to answer this inquiry.
      </p>
    </form>
  );
}
