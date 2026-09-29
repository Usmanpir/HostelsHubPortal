"use client";

import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import { ArrowRight, BedDouble, Building2, Check, Handshake, Layers } from "lucide-react";
import type { BusinessType } from "@/generated/prisma/enums";
import { FormGrid, SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CURRENCIES, TIMEZONES } from "@/config/defaults";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BUSINESS_TYPE_LABELS } from "@/lib/terms";
import { onboardingOrganizationSchema, type OnboardingOrganizationInput } from "@/lib/validation/auth";
import { saveOrganizationAction } from "@/app/onboarding/actions";
import type { PlanSummary } from "./types";
import { StepCard, StepFooter } from "./wizard-chrome";
import { BUSINESS_TYPE_DESCRIPTIONS, suggestsOwners } from "./vocabulary";

const BUSINESS_TYPE_ICONS: Record<BusinessType, typeof Building2> = {
  HOSTELS: BedDouble,
  PROPERTY_MANAGEMENT: Building2,
  REAL_ESTATE: Handshake,
  MIXED: Layers,
};
const BUSINESS_TYPE_ORDER: BusinessType[] = ["HOSTELS", "PROPERTY_MANAGEMENT", "REAL_ESTATE", "MIXED"];

export function OrganizationStep({
  initial,
  plans,
  isEditing,
}: {
  initial: OnboardingOrganizationInput;
  plans: PlanSummary[];
  isEditing: boolean;
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: onboardingOrganizationSchema,
    defaultValues: initial,
    action: saveOrganizationAction,
    successMessage: isEditing ? "Organization updated" : "Organization created",
    onSuccess: () => router.push("/onboarding?step=2"),
  });
  const c = form.control;
  const businessType = (useWatch({ control: c, name: "businessType" }) ?? "HOSTELS") as BusinessType;
  const isHostelOrg = businessType === "HOSTELS";

  return (
    <StepCard
      eyebrow="Step 1"
      title={isEditing ? "Your organization" : "Tell us about your organization"}
      description={`This is the business that owns your ${isHostelOrg ? "hostels" : "properties"}. Currency and time zone are used for rent, invoices and reports.`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <Controller
          control={c}
          name="businessType"
          render={({ field, fieldState }) => (
            <FieldSet>
              <FieldLegend>What do you manage?</FieldLegend>
              <p className="-mt-1 text-sm text-muted-foreground">We&apos;ll tailor the wording and features to your business. You can change this later.</p>
              <RadioGroup
                value={field.value ?? "HOSTELS"}
                onValueChange={field.onChange}
                className="grid gap-3 sm:grid-cols-2"
                aria-label="What do you manage?"
              >
                {BUSINESS_TYPE_ORDER.map((type) => {
                  const selected = (field.value ?? "HOSTELS") === type;
                  const Icon = BUSINESS_TYPE_ICONS[type];
                  return (
                    <label
                      key={type}
                      htmlFor={`business-${type}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-primary/40",
                        selected && "border-primary bg-primary/4 ring-3 ring-primary/15",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
                          selected && "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="size-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{BUSINESS_TYPE_LABELS[type]}</span>
                        <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">{BUSINESS_TYPE_DESCRIPTIONS[type]}</span>
                      </span>
                      <RadioGroupItem id={`business-${type}`} value={type} className="mt-0.5" />
                    </label>
                  );
                })}
              </RadioGroup>
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />
        {suggestsOwners(businessType) ? (
          <SwitchField
            control={c}
            name="ownersEnabled"
            label="I manage properties on behalf of owners"
            description="Track property owners, your management fee and owner payouts."
          />
        ) : null}

        <FormGrid>
          <TextField control={c} name="name" label="Organization name" required placeholder={isHostelOrg ? "Sunrise Hostels" : "Sunrise Properties"} className="sm:col-span-2" />
          <TextField control={c} name="email" label="Business email" type="email" autoComplete="email" />
          <TextField control={c} name="phone" label="Phone" type="tel" autoComplete="tel" />
          <TextField control={c} name="city" label="City" autoComplete="address-level2" />
          <TextField control={c} name="country" label="Country" autoComplete="country-name" />
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
        </FormGrid>

        <Controller
          control={c}
          name="planKey"
          render={({ field, fieldState }) => (
            <FieldSet>
              <FieldLegend>Plan</FieldLegend>
              <p className="-mt-1 text-sm text-muted-foreground">
                Every plan starts with a free trial. No payment details needed now — you can change plans any time.
              </p>
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2" aria-label="Plan">
                {plans.map((plan) => {
                  const selected = field.value === plan.key;
                  return (
                    <label
                      key={plan.key}
                      htmlFor={`plan-${plan.key}`}
                      className={cn(
                        "relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-background p-4 transition-colors hover:border-primary/40",
                        selected && "border-primary bg-primary/4 ring-3 ring-primary/15",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{plan.name}</p>
                          {plan.description ? <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{plan.description}</p> : null}
                        </div>
                        <RadioGroupItem id={`plan-${plan.key}`} value={plan.key} className="mt-0.5" />
                      </div>
                      <p className="text-sm">
                        {plan.priceMonthly > 0 ? (
                          <>
                            <span className="tabular text-lg font-semibold">{formatMoney(plan.priceMonthly, plan.currency)}</span>
                            <span className="text-muted-foreground"> / month after trial</span>
                          </>
                        ) : (
                          <span className="text-lg font-semibold">Free</span>
                        )}
                      </p>
                      <ul className="grid gap-1 text-xs text-muted-foreground">
                        {plan.trialDays > 0 ? (
                          <li className="flex items-center gap-1.5">
                            <Check className="size-3 text-success" />
                            {plan.trialDays}-day free trial
                          </li>
                        ) : null}
                        {plan.highlights.map((h) => (
                          <li key={h} className="flex items-center gap-1.5">
                            <Check className="size-3 text-success" />
                            {h}
                          </li>
                        ))}
                      </ul>
                    </label>
                  );
                })}
              </RadioGroup>
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />

        <StepFooter step={1}>
          <SubmitButton pending={pending} className="h-9 px-4">
            {isEditing ? "Save and continue" : "Create organization"}
            <ArrowRight />
          </SubmitButton>
        </StepFooter>
      </form>
    </StepCard>
  );
}
