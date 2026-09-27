"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { AlertTriangle, ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormGrid, FormSection, SelectField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { CURRENCIES, TIMEZONES } from "@/config/defaults";
import { LOCALES, organizationSettingsSchema, type OrganizationSettingsInput } from "@/lib/validation/settings";
import { updateOrganizationProfileAction } from "@/app/(app)/settings/actions";

type Logo = { id: string; name: string; size: number; mimeType: string } | null;

export function OrganizationProfileForm({
  initial,
  logo: initialLogo,
}: {
  initial: Omit<OrganizationSettingsInput, "logoFileId">;
  logo: Logo;
}) {
  const router = useRouter();
  const [logo, setLogo] = useState<Logo>(initialLogo);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);

  const { form, onSubmit, pending } = useActionForm({
    schema: organizationSettingsSchema,
    defaultValues: { ...initial, logoFileId: initialLogo?.id ?? null },
    action: (values) => updateOrganizationProfileAction(values),
    onSuccess: () => {
      setUploaded(null);
      // The saved values become the new baseline for "unsaved changes".
      form.reset(form.getValues());
      router.refresh();
    },
  });
  const c = form.control;
  const currency = useWatch({ control: c, name: "currency" });
  const currencyChanged = currency !== initial.currency;

  const setLogoFile = (file: UploadedFile | null) => {
    setUploaded(file);
    if (file) {
      setLogo({ id: file.id, name: file.name, size: file.size, mimeType: file.mimeType });
      form.setValue("logoFileId", file.id, { shouldDirty: true });
    } else {
      // Discarding a fresh upload restores the saved logo.
      setLogo(initialLogo);
      form.setValue("logoFileId", initialLogo?.id ?? null, { shouldDirty: true });
    }
  };

  const removeLogo = () => {
    setUploaded(null);
    setLogo(null);
    form.setValue("logoFileId", null, { shouldDirty: true });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection title="Logo" description="Shown in the sidebar, on invoices and on the resident portal. Square PNG or JPG works best.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
            {logo ? (
              // Served privately through /api/files after an authorization check.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${logo.id}`} alt="Organization logo" className="size-full object-contain" />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <FileUpload
              purpose="organization-logo"
              kind="image"
              value={uploaded}
              onChange={setLogoFile}
              label={logo ? "Replace logo" : "Upload logo"}
              hint="JPG, PNG or WebP · up to 10 MB"
            />
            {logo && !uploaded ? (
              <Button type="button" variant="ghost" size="sm" className="self-start text-destructive" onClick={removeLogo}>
                <Trash2 />
                Remove logo
              </Button>
            ) : null}
          </div>
        </div>
      </FormSection>

      <FormSection title="Details" description="Your registered business name and contact information.">
        <TextField control={c} name="name" label="Organization name" required autoComplete="organization" />
        <FormGrid>
          <TextField control={c} name="email" label="Email" type="email" autoComplete="email" />
          <TextField control={c} name="phone" label="Phone" type="tel" autoComplete="tel" />
        </FormGrid>
        <TextField control={c} name="address" label="Address" autoComplete="street-address" />
        <FormGrid>
          <TextField control={c} name="city" label="City" autoComplete="address-level2" />
          <TextField control={c} name="country" label="Country" autoComplete="country-name" />
        </FormGrid>
      </FormSection>

      <FormSection title="Regional" description="Currency and time zone used for amounts, due dates and reports.">
        <FormGrid>
          <SelectField
            control={c}
            name="currency"
            label="Currency"
            required
            options={CURRENCIES.map((cur) => ({ value: cur.code, label: cur.label }))}
          />
          <SelectField
            control={c}
            name="timezone"
            label="Time zone"
            required
            options={TIMEZONES.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
          />
          <SelectField
            control={c}
            name="locale"
            label="Language"
            options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
            description="More languages are coming soon."
          />
        </FormGrid>
        {currencyChanged ? (
          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              <span className="font-medium text-foreground">Existing amounts are not converted.</span>{" "}
              <span className="text-muted-foreground">
                Rent, invoices, payments and expenses already recorded keep their numbers and will be displayed in{" "}
                {currency}.
              </span>
            </p>
          </div>
        ) : null}
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending || !form.formState.isDirty} onClick={() => {
          form.reset();
          setUploaded(null);
          setLogo(initialLogo);
        }}>
          Discard changes
        </Button>
        <SubmitButton pending={pending}>Save changes</SubmitButton>
      </div>
    </form>
  );
}
