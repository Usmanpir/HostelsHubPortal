"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TextareaField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { dotClasses } from "@/components/shared/status-badge";
import { leadStageLabels, leadStageTones } from "@/config/real-estate-labels";
import type { LeadStage } from "@/generated/prisma/enums";
import { LEAD_STAGES, leadStageSchema } from "@/lib/validation/real-estate";
import { changeLeadStageAction } from "@/app/(app)/leads/actions";
import { cn } from "@/lib/utils";

/** Collects the (required) reason when a lead is marked lost. */
export function LostReasonDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: leadStageSchema,
    defaultValues: { stage: "LOST", lostReason: "" },
    action: (v) => changeLeadStageAction(leadId, v),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) form.reset({ stage: "LOST", lostReason: "" });
      }}
      title="Mark lead as lost"
      description="The reason helps you see why deals slip away."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextareaField control={form.control} name="lostReason" label="Reason" required rows={3} placeholder="Budget too low, bought elsewhere, not reachable…" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending} variant="destructive">
            Mark lost
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

/** Compact stage picker (board cards, lead header). Choosing "Lost" asks for a reason. */
export function LeadStageSelect({ leadId, stage, className }: { leadId: string; stage: LeadStage; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const change = (next: LeadStage) => {
    if (next === stage) return;
    if (next === "LOST") {
      setLostOpen(true);
      return;
    }
    start(async () => {
      try {
        const result = await changeLeadStageAction(leadId, { stage: next });
        if (result.ok) {
          toast.success(result.message ?? "Stage updated");
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });
  };
  return (
    <>
      <Select value={stage} onValueChange={(v) => change(v as LeadStage)} disabled={pending}>
        <SelectTrigger size="sm" className={cn("min-w-32", className)} aria-label="Lead stage">
          {pending ? <Spinner /> : null}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEAD_STAGES.map((s) => (
            <SelectItem key={s} value={s}>
              <span className={cn("size-2 rounded-full", dotClasses[leadStageTones[s]])} />
              {leadStageLabels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <LostReasonDialog leadId={leadId} open={lostOpen} onOpenChange={setLostOpen} />
    </>
  );
}

/** Stage pipeline as a row of steps; the current stage is highlighted. */
export function LeadStagePipeline({ leadId, stage, canManage }: { leadId: string; stage: LeadStage; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const steps: LeadStage[] = ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION", "WON"];
  const currentIndex = steps.indexOf(stage);
  const go = (next: LeadStage) =>
    start(async () => {
      try {
        const result = await changeLeadStageAction(leadId, { stage: next });
        if (result.ok) {
          toast.success(result.message ?? "Stage updated");
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-5 gap-1" aria-label="Lead stage">
        {steps.map((s, i) => {
          const done = stage !== "LOST" && currentIndex >= i;
          const current = s === stage;
          return (
            <li key={s}>
              <button
                type="button"
                disabled={!canManage || pending || current}
                onClick={() => go(s)}
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-md px-1 text-xs font-medium transition-colors disabled:cursor-default",
                  done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  canManage && !current && "hover:opacity-90",
                  current && "ring-2 ring-primary/30 ring-offset-1 ring-offset-background",
                )}
                aria-current={current ? "step" : undefined}
              >
                <span className="truncate">{leadStageLabels[s]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          {stage === "LOST" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => go("CONTACTED")}>
              Reopen lead
            </Button>
          ) : stage !== "WON" ? (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setLostOpen(true)}>
              Mark lost
            </Button>
          ) : null}
          {pending ? <Spinner /> : null}
        </div>
      ) : null}
      <LostReasonDialog leadId={leadId} open={lostOpen} onOpenChange={setLostOpen} />
    </div>
  );
}
