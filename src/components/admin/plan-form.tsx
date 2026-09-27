"use client";

import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormGrid, FormSection, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { PLAN_FEATURES } from "@/config/plans";
import { planSchema, type PlanInput } from "@/lib/validation/admin";
import { createPlanAction, updatePlanAction } from "@/app/admin/actions";

const FEATURE_LABELS: Record<string, { label: string; description: string }> = {
  [PLAN_FEATURES.advancedReports]: { label: "Advanced reports", description: "Financial and occupancy analytics" },
  [PLAN_FEATURES.exports]: { label: "Exports", description: "CSV / Excel downloads" },
  [PLAN_FEATURES.customBranding]: { label: "Custom branding", description: "Logo, colours and sender name" },
  [PLAN_FEATURES.emailNotifications]: { label: "Email notifications", description: "Deliver notifications by email" },
  [PLAN_FEATURES.residentPortal]: { label: "Resident portal", description: "Residents sign in to view bills and raise requests" },
  [PLAN_FEATURES.customRoles]: { label: "Custom roles", description: "Create roles with any permission set" },
};

const LIMITS: { name: "maxHostels" | "maxBeds" | "maxResidents" | "maxStaff" | "maxStorageMb"; label: string }[] = [
  { name: "maxHostels", label: "Hostels" },
  { name: "maxBeds", label: "Beds" },
  { name: "maxResidents", label: "Active residents" },
  { name: "maxStaff", label: "Staff" },
  { name: "maxStorageMb", label: "Storage (MB)" },
];

export type PlanFormValues = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  trialDays: number;
  limits: Partial<Record<(typeof LIMITS)[number]["name"], number | null>>;
  features: string[];
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
};

export function PlanForm({ plan }: { plan?: PlanFormValues }) {
  const router = useRouter();
  const defaults: PlanInput = plan
    ? {
        key: plan.key,
        name: plan.name,
        description: plan.description ?? "",
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        currency: plan.currency,
        trialDays: plan.trialDays,
        maxHostels: plan.limits.maxHostels ?? "",
        maxBeds: plan.limits.maxBeds ?? "",
        maxResidents: plan.limits.maxResidents ?? "",
        maxStaff: plan.limits.maxStaff ?? "",
        maxStorageMb: plan.limits.maxStorageMb ?? "",
        features: plan.features,
        isPublic: plan.isPublic,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
      }
    : {
        key: "",
        name: "",
        description: "",
        priceMonthly: 0,
        priceYearly: 0,
        currency: "USD",
        trialDays: 14,
        maxHostels: "",
        maxBeds: "",
        maxResidents: "",
        maxStaff: "",
        maxStorageMb: "",
        features: [],
        isPublic: true,
        isActive: true,
        sortOrder: 0,
      };
  const { form, onSubmit, pending } = useActionForm({
    schema: planSchema,
    defaultValues: defaults,
    action: (v) => (plan ? updatePlanAction(plan.id, v) : createPlanAction(v)),
    onSuccess: () => {
      router.push("/admin/plans");
      router.refresh();
    },
  });
  const c = form.control;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection title="Basics" description="Name and description shown on pricing and billing pages.">
        <FormGrid>
          <TextField control={c} name="name" label="Name" required />
          <TextField
            control={c}
            name="key"
            label="Key"
            required
            disabled={!!plan}
            description={plan ? "Keys can't be changed after creation." : "Lowercase identifier used in code, e.g. business"}
          />
        </FormGrid>
        <TextareaField control={c} name="description" label="Description" rows={2} />
      </FormSection>

      <FormSection title="Pricing" description="List prices. Yearly is used ÷ 12 for MRR.">
        <FormGrid className="sm:grid-cols-3">
          <TextField control={c} name="currency" label="Currency" required placeholder="USD" />
          <TextField control={c} name="priceMonthly" label="Monthly price" type="number" inputMode="decimal" required />
          <TextField control={c} name="priceYearly" label="Yearly price" type="number" inputMode="decimal" required />
        </FormGrid>
        <FormGrid>
          <TextField control={c} name="trialDays" label="Trial days" type="number" inputMode="numeric" required />
          <TextField control={c} name="sortOrder" label="Sort order" type="number" inputMode="numeric" description="Lower shows first." />
        </FormGrid>
      </FormSection>

      <FormSection title="Limits" description="Leave empty for unlimited.">
        <FormGrid className="sm:grid-cols-3">
          {LIMITS.map((l) => (
            <TextField key={l.name} control={c} name={l.name} label={l.label} type="number" inputMode="numeric" placeholder="Unlimited" />
          ))}
        </FormGrid>
      </FormSection>

      <FormSection title="Features" description="Capabilities included in this plan.">
        <Controller
          control={c}
          name="features"
          render={({ field }) => {
            const selected = new Set((field.value as string[] | undefined) ?? []);
            return (
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.values(PLAN_FEATURES).map((key) => {
                  const id = `feature-${key.replace(/\W/g, "-")}`;
                  return (
                    <div key={key} className="flex items-start gap-2.5 rounded-lg border p-3">
                      <Checkbox
                        id={id}
                        checked={selected.has(key)}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v === true) next.add(key);
                          else next.delete(key);
                          field.onChange([...next]);
                        }}
                      />
                      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
                        <span className="text-sm font-medium">{FEATURE_LABELS[key]?.label ?? key}</span>
                        <span className="text-xs text-muted-foreground">{FEATURE_LABELS[key]?.description}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
      </FormSection>

      <FormSection title="Availability">
        <SwitchField control={c} name="isActive" label="Active" description="Inactive plans can't be assigned to organizations." />
        <SwitchField control={c} name="isPublic" label="Public" description="Shown on the public pricing and billing pages." />
      </FormSection>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/plans")}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{plan ? "Save plan" : "Create plan"}</SubmitButton>
      </div>
    </form>
  );
}
