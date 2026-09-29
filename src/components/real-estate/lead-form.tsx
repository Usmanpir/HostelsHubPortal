"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormGrid, FormSection, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { useFormatters } from "@/components/shared/org-context";
import { optionsFrom } from "@/config/labels";
import { leadSourceLabels, leadStageLabels, listingPurposeLabels } from "@/config/real-estate-labels";
import type { LeadStage } from "@/generated/prisma/enums";
import { leadSchema, type LeadInput } from "@/lib/validation/real-estate";
import { createLeadAction, findDuplicateLeadsAction, updateLeadAction } from "@/app/(app)/leads/actions";

type Duplicate = { id: string; code: string; name: string; phone: string | null; email: string | null; stage: LeadStage; assignedTo: { name: string } | null };

/** Warns when the phone or email already belongs to an open lead. */
function useDuplicateHint(phone: string | undefined, email: string | undefined, excludeId?: string) {
  const [dupes, setDupes] = useState<Duplicate[]>([]);
  useEffect(() => {
    const p = (phone ?? "").replace(/\D/g, "");
    const e = (email ?? "").trim();
    if (p.length < 7 && !e.includes("@")) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const result = await findDuplicateLeadsAction({ phone: phone || undefined, email: e || undefined, excludeId });
        if (!cancelled) setDupes(result.ok ? result.data : []);
      } catch {
        if (!cancelled) setDupes([]);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phone, email, excludeId]);
  const p = (phone ?? "").replace(/\D/g, "");
  return p.length < 7 && !(email ?? "").includes("@") ? [] : dupes;
}

export function LeadForm({
  leadId,
  initial,
  listings,
  agents,
}: {
  leadId?: string;
  initial?: Partial<LeadInput>;
  listings: { id: string; code: string; title: string }[];
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { currency } = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: leadSchema,
    defaultValues: { name: "", phone: "", email: "", source: "PHONE", ...initial },
    action: (values) => (leadId ? updateLeadAction(leadId, values) : createLeadAction(values)),
    onSuccess: (data) => {
      router.push(`/leads/${(data as { id: string }).id}`);
      router.refresh();
    },
  });
  const c = form.control;
  const phone = useWatch({ control: c, name: "phone" });
  const email = useWatch({ control: c, name: "email" });
  const duplicates = useDuplicateHint(phone, email, leadId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection title="Contact" description="A phone number or email is required.">
        <TextField control={c} name="name" label="Name" required placeholder="Ahmed Raza" />
        <FormGrid>
          <TextField control={c} name="phone" label="Phone / WhatsApp" type="tel" placeholder="0300 1234567" autoComplete="off" />
          <TextField control={c} name="email" label="Email" type="email" autoComplete="off" />
        </FormGrid>
        {duplicates.length ? (
          <div role="status" className="flex gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="font-medium">Possible duplicate</p>
              <p className="text-muted-foreground">An open lead already uses this phone or email:</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <Link href={`/leads/${d.id}`} target="_blank" className="font-medium hover:text-primary">
                      {d.name}
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground">
                      {d.code} · {leadStageLabels[d.stage]} · {d.assignedTo?.name ?? "Unassigned"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        <FormGrid>
          <SelectField control={c} name="source" label="Source" options={optionsFrom(leadSourceLabels)} />
          <SelectField control={c} name="assignedUserId" label="Assigned to" allowEmpty="Unassigned" options={agents.map((a) => ({ value: a.id, label: a.name }))} />
        </FormGrid>
      </FormSection>

      <FormSection title="Requirement">
        <FormGrid>
          <SelectField control={c} name="interest" label="Looking to" allowEmpty="Not sure yet" options={optionsFrom(listingPurposeLabels).map((o) => ({ ...o, label: o.value === "SALE" ? "Buy" : "Rent" }))} />
          <SelectField
            control={c}
            name="listingId"
            label="Interested in listing"
            allowEmpty="No specific listing"
            options={listings.map((l) => ({ value: l.id, label: `${l.code} · ${l.title}` }))}
          />
          <MoneyField control={c} name="budgetMin" label="Budget from" currency={currency} />
          <MoneyField control={c} name="budgetMax" label="Budget up to" currency={currency} />
        </FormGrid>
        <TextField control={c} name="preferredLocation" label="Preferred location" placeholder="Bahria Town, Gulberg…" />
        <TextareaField control={c} name="message" label="Client's message" rows={3} />
      </FormSection>

      <FormSection title="Follow-up">
        <FormGrid>
          <TextField control={c} name="nextFollowUpAt" label="Next follow-up" type="date" />
        </FormGrid>
        <TextareaField control={c} name="notes" label="Internal notes" rows={3} />
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{leadId ? "Save changes" : "Add lead"}</SubmitButton>
      </div>
    </form>
  );
}
