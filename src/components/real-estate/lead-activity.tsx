"use client";

import { ArrowRight, CalendarCheck, Mail, MessageCircle, Phone, StickyNote, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TextareaField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { useFormatters } from "@/components/shared/org-context";
import { leadActivityTypeLabels } from "@/config/real-estate-labels";
import type { LeadActivityType } from "@/generated/prisma/enums";
import { formatRelative } from "@/lib/format";
import { leadActivitySchema, MANUAL_ACTIVITY_TYPES } from "@/lib/validation/real-estate";
import { addLeadActivityAction } from "@/app/(app)/leads/actions";
import { cn } from "@/lib/utils";

export type LeadActivityItem = {
  id: string;
  type: LeadActivityType;
  body: string;
  createdAt: Date | string;
  user: { id: string; name: string } | null;
};

const ICONS: Record<LeadActivityType, { icon: LucideIcon; tone: string }> = {
  NOTE: { icon: StickyNote, tone: "bg-muted text-muted-foreground" },
  CALL: { icon: Phone, tone: "bg-info-soft text-info" },
  WHATSAPP: { icon: MessageCircle, tone: "bg-success-soft text-success" },
  EMAIL: { icon: Mail, tone: "bg-violet-soft text-violet" },
  MEETING: { icon: CalendarCheck, tone: "bg-warning-soft text-warning" },
  STAGE_CHANGE: { icon: ArrowRight, tone: "bg-accent text-accent-foreground" },
};

const PLACEHOLDERS: Record<(typeof MANUAL_ACTIVITY_TYPES)[number], string> = {
  NOTE: "Add a note…",
  CALL: "What was discussed on the call?",
  WHATSAPP: "Summary of the WhatsApp conversation…",
  EMAIL: "What was sent or received?",
  MEETING: "Meeting notes…",
};

function ActivityComposer({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: leadActivitySchema,
    defaultValues: { type: "NOTE", body: "" },
    action: (v) => addLeadActivityAction(leadId, v),
    onSuccess: () => {
      form.reset({ type: form.getValues("type"), body: "" });
      router.refresh();
    },
  });
  const type = (useWatch({ control: form.control, name: "type" }) ?? "NOTE") as (typeof MANUAL_ACTIVITY_TYPES)[number];
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3" noValidate>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={type}
        onValueChange={(v) => v && form.setValue("type", v as typeof type)}
        className="flex-wrap"
        aria-label="Activity type"
      >
        {MANUAL_ACTIVITY_TYPES.map((t) => {
          const Icon = ICONS[t].icon;
          return (
            <ToggleGroupItem key={t} value={t} aria-label={leadActivityTypeLabels[t]}>
              <Icon />
              <span className="hidden sm:inline">{leadActivityTypeLabels[t]}</span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <TextareaField control={form.control} name="body" rows={3} placeholder={PLACEHOLDERS[type]} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Log {leadActivityTypeLabels[type].toLowerCase()}</SubmitButton>
      </div>
    </form>
  );
}

/** Activity feed (newest first) with a composer for managers. */
export function LeadActivityFeed({ leadId, items, canManage }: { leadId: string; items: LeadActivityItem[]; canManage: boolean }) {
  const fmt = useFormatters();
  return (
    <div className="flex flex-col gap-4">
      {canManage ? <ActivityComposer leadId={leadId} /> : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet. Log your first call or note.</p>
      ) : (
        <ol className="relative flex flex-col gap-4 ps-1">
          {items.map((a, i) => {
            const { icon: Icon, tone } = ICONS[a.type];
            return (
              <li key={a.id} className="relative flex gap-3">
                {i < items.length - 1 ? <span className="absolute start-3.5 top-8 bottom-[-1rem] w-px bg-border" aria-hidden /> : null}
                <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", tone)}>
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{leadActivityTypeLabels[a.type]}</span>
                    {a.user ? ` · ${a.user.name}` : ""} · <span title={fmt.dateTime(a.createdAt)}>{formatRelative(a.createdAt)}</span>
                  </p>
                  <p className={cn("mt-0.5 text-sm whitespace-pre-line", a.type === "STAGE_CHANGE" && "text-muted-foreground")}>{a.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
