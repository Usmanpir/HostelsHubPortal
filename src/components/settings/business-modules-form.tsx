"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSection, SwitchField, TextareaField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { BusinessType } from "@/generated/prisma/enums";
import { BUSINESS_TYPE_LABELS } from "@/lib/terms";
import { businessModulesSchema, type BusinessModulesInput } from "@/lib/validation/settings";
import { updateBusinessModulesAction } from "@/app/(app)/settings/actions";
import { cn } from "@/lib/utils";

const BUSINESS_TYPE_DESCRIPTIONS: Record<BusinessType, string> = {
  HOSTELS: "Hostels, PGs and shared rooms rented by the bed to residents.",
  PROPERTY_MANAGEMENT: "Houses, apartments and shops rented as whole units to tenants.",
  REAL_ESTATE: "An agency that lists, sells and leases property for clients.",
  MIXED: "A mix of hostels, rental units and sales. Uses property wording.",
};

const BUSINESS_TYPES = Object.values(BusinessType);

export function BusinessModulesForm({
  initial,
  publicUrl,
}: {
  initial: BusinessModulesInput;
  publicUrl: string;
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: businessModulesSchema,
    defaultValues: initial,
    action: (values) => updateBusinessModulesAction(values),
    onSuccess: () => {
      form.reset(form.getValues());
      router.refresh();
    },
  });
  const c = form.control;
  const dealerEnabled = useWatch({ control: c, name: "dealerEnabled" });
  const publicListingsEnabled = useWatch({ control: c, name: "publicListingsEnabled" });

  // Public listings depend on the sales & leasing module.
  useEffect(() => {
    if (!dealerEnabled && form.getValues("publicListingsEnabled")) {
      form.setValue("publicListingsEnabled", false, { shouldDirty: true });
    }
  }, [dealerEnabled, form]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection
        title="Business type"
        description="Hostels use hostel, room and resident wording; other types use property, unit and tenant."
      >
        <Controller
          control={c}
          name="businessType"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Business type" className="grid gap-3 sm:grid-cols-2">
              {BUSINESS_TYPES.map((type) => {
                const selected = field.value === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => field.onChange(type)}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-3 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "border-primary bg-primary/5 ring-1 ring-primary",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {BUSINESS_TYPE_LABELS[type]}
                      {selected ? <Check className="size-4 text-primary" /> : null}
                    </span>
                    <span className="text-sm text-muted-foreground">{BUSINESS_TYPE_DESCRIPTIONS[type]}</span>
                  </button>
                );
              })}
            </div>
          )}
        />
      </FormSection>

      <FormSection title="Modules" description="Turn on the extra tools you need. You can change these at any time.">
        <SwitchField
          control={c}
          name="ownersEnabled"
          label="Owners & payouts"
          description="Manage properties on behalf of owners, with owner statements and payouts."
        />
        <SwitchField
          control={c}
          name="dealerEnabled"
          label="Sales & leasing"
          description="Dealer CRM: listings, leads, viewings and deals."
        />
        <SwitchField
          control={c}
          name="publicListingsEnabled"
          label="Public listings page"
          description={
            dealerEnabled
              ? "Publish your listings on a public page where visitors can send inquiries."
              : "Turn on Sales & leasing to publish a public listings page."
          }
          disabled={!dealerEnabled}
        />
      </FormSection>

      {dealerEnabled && publicListingsEnabled ? (
        <FormSection title="Public page" description="What visitors see on your public listings page.">
          <PublicUrl url={publicUrl} />
          <TextareaField
            control={c}
            name="publicProfileIntro"
            label="Introduction"
            rows={4}
            placeholder="A short introduction to your business, areas you cover and how to reach you."
            description="Up to 2,000 characters."
          />
        </FormSection>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending || !form.formState.isDirty} onClick={() => form.reset()}>
          Discard changes
        </Button>
        <SubmitButton pending={pending}>Save changes</SubmitButton>
      </div>
    </form>
  );
}

function PublicUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically. Select the link and copy it manually.");
    }
  };
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Public page URL</span>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Public page URL" />
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy link">
          {copied ? <Check /> : <Copy />}
        </Button>
        <Button type="button" variant="outline" size="icon" asChild>
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open public page">
            <ExternalLink />
          </a>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Save your changes before sharing — the page is live once saved.</p>
    </div>
  );
}
