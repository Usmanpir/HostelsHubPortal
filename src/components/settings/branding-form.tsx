"use client";

import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import { Globe, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormGrid, FormSection, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { brandingSchema, HEX_COLOR, type BrandingInput } from "@/lib/validation/settings";
import { updateBrandingAction } from "@/app/(app)/settings/actions";

const EMPTY: BrandingInput = { brandName: "", primaryColor: "", customDomain: "", emailSenderName: "", emailSenderAddress: "" };
const SWATCHES = ["#4f46e5", "#0ea5e9", "#059669", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#0f172a"];

export function BrandingForm({
  initial,
  allowed,
  organizationName,
}: {
  initial: BrandingInput;
  allowed: boolean;
  organizationName: string;
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: brandingSchema,
    defaultValues: initial,
    action: (values) => updateBrandingAction(values),
    onSuccess: () => {
      form.reset(form.getValues());
      router.refresh();
    },
  });
  const c = form.control;
  const [brandName, primaryColor, customDomain] = useWatch({ control: c, name: ["brandName", "primaryColor", "customDomain"] });
  const color = primaryColor && HEX_COLOR.test(primaryColor.toLowerCase()) ? primaryColor.toLowerCase() : null;
  const hasSaved = Object.values(initial).some(Boolean);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <fieldset disabled={!allowed || pending} className="flex flex-col gap-6 disabled:opacity-70">
        <FormSection title="Identity" description="Replaces the app name in the sidebar, browser tab and resident portal.">
          <TextField control={c} name="brandName" label="Brand name" placeholder={organizationName} />
          <Controller
            control={c}
            name="primaryColor"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="field-primaryColor">Primary colour</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border">
                    <span className="size-full" style={{ backgroundColor: color ?? "transparent" }} />
                    <input
                      type="color"
                      aria-label="Pick a colour"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      value={color ?? "#4f46e5"}
                      onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                    />
                  </label>
                  <Input
                    id="field-primaryColor"
                    className="w-32 font-mono uppercase"
                    placeholder="#4F46E5"
                    maxLength={7}
                    aria-invalid={fieldState.invalid}
                    {...field}
                    value={field.value ?? ""}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {SWATCHES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-label={`Use ${s}`}
                        onClick={() => field.onChange(s)}
                        className="size-6 rounded-full border-2 border-background ring-1 ring-border transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-foreground"
                        aria-pressed={color === s}
                        style={{ backgroundColor: s }}
                      />
                    ))}
                  </div>
                </div>
                <FieldDescription>Used for buttons, links and highlights. Leave empty for the default theme.</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <div className="overflow-hidden rounded-lg border">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Globe className="size-3.5" />
              <span className="truncate">{customDomain || "your-app-domain"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 p-4">
              <span
                className="flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: color ?? "var(--primary)" }}
              >
                {(brandName || organizationName).trim().charAt(0).toUpperCase() || "B"}
              </span>
              <span className="font-semibold">{brandName || organizationName}</span>
              <span
                className="ms-auto rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: color ?? "var(--primary)" }}
              >
                Primary button
              </span>
            </div>
          </div>
        </FormSection>

        <FormSection title="Custom domain" description="Serve the app from your own domain. Point a CNAME record to this app, then enter the domain here.">
          <TextField control={c} name="customDomain" label="Domain" placeholder="portal.yourhostel.com" inputMode="url" />
        </FormSection>

        <FormSection title="Email sender" description="Name and address residents and staff see on notification emails.">
          <FormGrid>
            <TextField control={c} name="emailSenderName" label="Sender name" placeholder={organizationName} />
            <TextField control={c} name="emailSenderAddress" label="Sender address" type="email" placeholder="no-reply@yourhostel.com" />
          </FormGrid>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Mail className="mt-0.5 size-3.5 shrink-0" />
            The sender domain must be verified with your email provider, otherwise messages may be marked as spam.
          </p>
        </FormSection>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        {!allowed && hasSaved ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              form.reset(EMPTY, { keepDefaultValues: true });
              void onSubmit();
            }}
          >
            Remove branding
          </Button>
        ) : null}
        {allowed ? (
          <>
            <Button type="button" variant="outline" disabled={pending || !form.formState.isDirty} onClick={() => form.reset()}>
              Discard changes
            </Button>
            <SubmitButton pending={pending}>Save branding</SubmitButton>
          </>
        ) : null}
      </div>
    </form>
  );
}
