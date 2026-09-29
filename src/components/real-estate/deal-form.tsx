"use client";

import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormGrid, FormSection, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { useFormatters } from "@/components/shared/org-context";
import { optionsFrom } from "@/config/labels";
import { dealTypeLabels } from "@/config/real-estate-labels";
import { computeCommission, dealSchema, type DealInput } from "@/lib/validation/real-estate";
import { createDealAction, updateDealAction } from "@/app/(app)/deals/actions";

export type DealFormOptions = {
  leads: { id: string; code: string; name: string; listingId: string | null; assignedUserId: string | null }[];
  listings: { id: string; code: string; title: string; purpose: "SALE" | "RENT"; price: number; agentUserId: string | null }[];
  agents: { id: string; name: string }[];
};

function num(v: unknown) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function DealForm({ dealId, initial, options }: { dealId?: string; initial?: Partial<DealInput>; options: DealFormOptions }) {
  const router = useRouter();
  const fmt = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: dealSchema,
    defaultValues: { type: "SALE", clientName: "", commissionPercent: 2, ...initial },
    action: (values) => (dealId ? updateDealAction(dealId, values) : createDealAction(values)),
    onSuccess: (data) => {
      router.push(`/deals/${(data as { id: string }).id}`);
      router.refresh();
    },
  });
  const c = form.control;
  const amount = num(useWatch({ control: c, name: "agreedAmount" }));
  const percent = num(useWatch({ control: c, name: "commissionPercent" }));
  const computed = amount !== null && percent !== null ? computeCommission(amount, percent) : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection title="Client & property" description="Link the lead and listing to update them automatically when the deal closes.">
        <FormGrid>
          <SelectField
            control={c}
            name="leadId"
            label="Lead"
            allowEmpty="No lead"
            options={options.leads.map((l) => ({ value: l.id, label: `${l.name} · ${l.code}` }))}
            onValueChange={(v) => {
              const lead = options.leads.find((l) => l.id === v);
              if (!lead) return;
              form.setValue("clientName", lead.name, { shouldValidate: true });
              if (lead.assignedUserId) form.setValue("agentUserId", lead.assignedUserId);
              if (lead.listingId && !form.getValues("listingId") && options.listings.some((x) => x.id === lead.listingId)) {
                const listing = options.listings.find((x) => x.id === lead.listingId)!;
                form.setValue("listingId", listing.id);
                form.setValue("type", listing.purpose);
                if (!form.getValues("agreedAmount")) form.setValue("agreedAmount", listing.price);
              }
            }}
          />
          <SelectField
            control={c}
            name="listingId"
            label="Listing"
            allowEmpty="No listing"
            options={options.listings.map((l) => ({ value: l.id, label: `${l.code} · ${l.title}` }))}
            onValueChange={(v) => {
              const listing = options.listings.find((l) => l.id === v);
              if (!listing) return;
              form.setValue("type", listing.purpose, { shouldValidate: true });
              if (!form.getValues("agreedAmount")) form.setValue("agreedAmount", listing.price);
              if (listing.agentUserId && !form.getValues("agentUserId")) form.setValue("agentUserId", listing.agentUserId);
            }}
          />
          <TextField control={c} name="clientName" label="Client name" required />
          <SelectField control={c} name="type" label="Deal type" required options={optionsFrom(dealTypeLabels)} />
        </FormGrid>
      </FormSection>

      <FormSection title="Amount & commission">
        <FormGrid>
          <MoneyField control={c} name="agreedAmount" label="Agreed amount" required currency={fmt.currency} description="Sale price, or monthly rent for rentals." />
          <TextField control={c} name="commissionPercent" label="Commission %" type="number" inputMode="decimal" />
          <MoneyField
            control={c}
            name="commissionAmount"
            label="Commission amount"
            currency={fmt.currency}
            placeholder={computed !== null ? String(computed) : "0"}
            description={computed !== null ? `Leave blank to use ${fmt.money(computed)} (${percent}% of the agreed amount).` : "Leave blank to calculate from the percentage."}
          />
          <SelectField control={c} name="agentUserId" label="Agent" allowEmpty="No agent" options={options.agents.map((a) => ({ value: a.id, label: a.name }))} />
        </FormGrid>
      </FormSection>

      <FormSection title="Timeline & notes">
        <FormGrid>
          <TextField control={c} name="expectedCloseDate" label="Expected closing" type="date" />
        </FormGrid>
        <TextareaField control={c} name="notes" label="Notes" rows={3} placeholder="Token money, payment plan, documents pending…" />
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{dealId ? "Save changes" : "Create deal"}</SubmitButton>
      </div>
    </form>
  );
}
