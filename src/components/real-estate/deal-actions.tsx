"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash, FileSignature, RotateCcw, Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { useOrg } from "@/components/shared/org-context";
import { dealStageLabels } from "@/config/real-estate-labels";
import type { DealStage, DealType } from "@/generated/prisma/enums";
import { todayInTimeZone } from "@/lib/format";
import { dealCommissionSchema, dealStageSchema } from "@/lib/validation/real-estate";
import { changeDealStageAction, setDealCommissionPaidAction } from "@/app/(app)/deals/actions";

type Variant = "default" | "outline" | "destructive";

function meta(from: DealStage, to: DealStage, type: DealType, links: { lead: boolean; listing: boolean }): { label: string; icon: LucideIcon; variant: Variant; description: string } {
  switch (to) {
    case "AGREEMENT":
      return {
        label: "Agreement signed",
        icon: FileSignature,
        variant: "outline",
        description: links.listing ? "An active listing is marked under offer." : "Terms are agreed and paperwork is in progress.",
      };
    case "CLOSED_WON": {
      const effects = [
        links.lead ? "the lead is marked won" : null,
        links.listing ? `the listing is marked ${type === "SALE" ? "sold" : "rented"} and removed from the public page` : null,
      ].filter(Boolean);
      return {
        label: "Close as won",
        icon: CheckCircle2,
        variant: "default",
        description: `This is final.${effects.length ? ` When closed, ${effects.join(" and ")}.` : ""}`,
      };
    }
    case "CLOSED_LOST":
      return { label: "Close as lost", icon: CircleSlash, variant: "destructive", description: "The deal fell through. An under-offer listing becomes active again." };
    case "OPEN":
      return {
        label: from === "CLOSED_LOST" ? "Reopen" : "Back to open",
        icon: RotateCcw,
        variant: "outline",
        description: from === "AGREEMENT" ? "The agreement is on hold." : "Continue working on this deal.",
      };
  }
}

function StageDialog({
  dealId,
  from,
  to,
  type,
  links,
}: {
  dealId: string;
  from: DealStage;
  to: DealStage;
  type: DealType;
  links: { lead: boolean; listing: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const m = meta(from, to, type, links);
  const Icon = m.icon;
  const { form, onSubmit, pending } = useActionForm({
    schema: dealStageSchema,
    defaultValues: { stage: to, note: "" },
    action: (v) => changeDealStageAction(dealId, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ stage: to, note: "" });
      }}
      trigger={
        <Button variant={m.variant === "destructive" ? "ghost" : m.variant} className={m.variant === "destructive" ? "text-destructive" : undefined}>
          <Icon />
          {m.label}
        </Button>
      }
      title={`${m.label}?`}
      description={`${dealStageLabels[from]} → ${dealStageLabels[to]}. ${m.description}`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextareaField
          control={form.control}
          name="note"
          label={to === "CLOSED_LOST" ? "Why was it lost?" : "Note"}
          rows={3}
          placeholder="Optional — added to the deal notes"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending} variant={m.variant === "destructive" ? "destructive" : "default"}>
            {m.label}
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export function DealStageButtons({
  dealId,
  stage,
  type,
  allowed,
  links,
}: {
  dealId: string;
  stage: DealStage;
  type: DealType;
  allowed: DealStage[];
  links: { lead: boolean; listing: boolean };
}) {
  if (allowed.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
      {allowed.map((to) => (
        <StageDialog key={to} dealId={dealId} from={stage} to={to} type={type} links={links} />
      ))}
    </div>
  );
}

export function CommissionPaidButton({ dealId, paid }: { dealId: string; paid: boolean }) {
  const router = useRouter();
  const { timezone } = useOrg();
  const [open, setOpen] = useState(false);
  const { form, onSubmit, pending } = useActionForm({
    schema: dealCommissionSchema,
    defaultValues: { paid: true, paidOn: todayInTimeZone(timezone) },
    action: (v) => setDealCommissionPaidAction(dealId, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  if (paid) {
    return (
      <ConfirmAction
        trigger={
          <Button size="sm" variant="ghost">
            <RotateCcw />
            Mark unpaid
          </Button>
        }
        title="Mark commission as unpaid?"
        description="Use this if the payment was recorded by mistake."
        confirmLabel="Mark unpaid"
        action={() => setDealCommissionPaidAction(dealId, { paid: false })}
      />
    );
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ paid: true, paidOn: todayInTimeZone(timezone) });
      }}
      trigger={
        <Button size="sm">
          <Wallet />
          Mark commission paid
        </Button>
      }
      title="Commission received"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField control={form.control} name="paidOn" label="Paid on" type="date" required />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
