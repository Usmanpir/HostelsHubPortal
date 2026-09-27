"use client";

import { useState } from "react";
import { CalendarCheck, Send } from "lucide-react";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { demoRequestSchema } from "@/lib/validation/auth";
import { requestDemoAction } from "@/app/(marketing)/actions";

const HOSTEL_COUNTS = [
  { value: "1", label: "1 hostel" },
  { value: "2-5", label: "2–5 hostels" },
  { value: "6-20", label: "6–20 hostels" },
  { value: "20+", label: "More than 20" },
];

export function ContactForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { form, onSubmit, pending } = useActionForm({
    schema: demoRequestSchema,
    defaultValues: { name: "", email: "", company: "", phone: "", hostels: "1", message: "", website: "" },
    action: requestDemoAction,
    successMessage: () => "",
    onSuccess: () => setSentTo(form.getValues("email")),
  });
  const c = form.control;

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
          <CalendarCheck className="size-6" />
        </span>
        <p className="text-lg font-semibold">Request received</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Thanks! We&apos;ll email <span className="font-medium text-foreground">{sentTo}</span> to find a time for your demo.
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            form.reset();
            setSentTo(null);
          }}
        >
          Send another request
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6" noValidate>
      <FormGrid>
        <TextField control={c} name="name" label="Your name" autoComplete="name" required />
        <TextField control={c} name="email" label="Work email" type="email" autoComplete="email" required />
        <TextField control={c} name="company" label="Company" autoComplete="organization" />
        <TextField control={c} name="phone" label="Phone" type="tel" autoComplete="tel" />
      </FormGrid>
      <SelectField control={c} name="hostels" label="How many hostels do you run?" options={HOSTEL_COUNTS} required />
      <TextareaField control={c} name="message" label="What would you like to see?" rows={4} placeholder="Billing, bed allocation, staff attendance…" />
      {/* Honeypot: hidden from people and assistive tech, filled in by bots. */}
      <div aria-hidden className="absolute -inset-s-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <SubmitButton pending={pending} pendingText="Sending…" className="h-10">
        <Send />
        Book a demo
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">We only use your details to reply to this request.</p>
    </form>
  );
}
