"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useOrg } from "@/components/shared/org-context";
import { viewingStatusLabels } from "@/config/real-estate-labels";
import {
  localPartsInZone,
  viewingOutcomeSchema,
  viewingRescheduleSchema,
  viewingSchema,
  type ViewingInput,
} from "@/lib/validation/real-estate";
import { recordViewingOutcomeAction, rescheduleViewingAction, scheduleViewingAction } from "@/app/(app)/leads/viewings/actions";

export type LeadOption = { id: string; code: string; name: string; phone: string | null; listingId: string | null; assignedUserId: string | null };
export type ListingOption = { id: string; code: string; title: string; status: string; agentUserId: string | null };
export type AgentOption = { id: string; name: string };

/** Next full hour in the org time zone, as date + time inputs. */
function nextSlot(timeZone: string) {
  const at = new Date(Date.now() + 60 * 60_000);
  at.setUTCMinutes(0, 0, 0);
  return localPartsInZone(at, timeZone);
}

export function ScheduleViewingDialog({
  trigger,
  leads,
  listings,
  agents,
  leadId,
  listingId,
}: {
  trigger: React.ReactNode;
  leads: LeadOption[];
  listings: ListingOption[];
  agents: AgentOption[];
  /** Fixed lead (scheduling from the lead page). */
  leadId?: string;
  /** Fixed listing (scheduling from the listing page). */
  listingId?: string;
}) {
  const router = useRouter();
  const { timezone } = useOrg();
  const [open, setOpen] = useState(false);
  const defaults = (): Partial<ViewingInput> => {
    const slot = nextSlot(timezone);
    const lead = leads.find((l) => l.id === leadId);
    const listing = listings.find((l) => l.id === (listingId ?? lead?.listingId));
    return {
      leadId: leadId ?? "",
      listingId: listing?.id ?? listingId ?? "",
      agentUserId: lead?.assignedUserId ?? listing?.agentUserId ?? "",
      date: slot.date,
      time: slot.time,
    };
  };
  const { form, onSubmit, pending } = useActionForm({
    schema: viewingSchema,
    defaultValues: defaults(),
    action: scheduleViewingAction,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(defaults());
      }}
      trigger={trigger}
      title="Schedule a viewing"
      description={`Times are in ${timezone}. The agent is notified.`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {leadId ? null : (
          <SelectField
            control={c}
            name="leadId"
            label="Lead"
            required
            options={leads.map((l) => ({ value: l.id, label: `${l.name} · ${l.code}` }))}
            placeholder={leads.length ? "Select a lead" : "No open leads"}
            onValueChange={(v) => {
              const lead = leads.find((l) => l.id === v);
              if (lead?.listingId && !listingId && listings.some((x) => x.id === lead.listingId)) form.setValue("listingId", lead.listingId);
              if (lead?.assignedUserId) form.setValue("agentUserId", lead.assignedUserId);
            }}
          />
        )}
        {listingId ? null : (
          <SelectField
            control={c}
            name="listingId"
            label="Listing"
            required
            options={listings.map((l) => ({ value: l.id, label: `${l.code} · ${l.title}` }))}
            placeholder={listings.length ? "Select a listing" : "No available listings"}
          />
        )}
        <SelectField control={c} name="agentUserId" label="Agent" allowEmpty="No agent" options={agents.map((a) => ({ value: a.id, label: a.name }))} />
        <FormGrid>
          <TextField control={c} name="date" label="Date" type="date" required />
          <TextField control={c} name="time" label="Time" type="time" required />
        </FormGrid>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Schedule</SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}

export function RescheduleViewingDialog({
  viewingId,
  scheduledAt,
  agentUserId,
  agents,
  trigger,
}: {
  viewingId: string;
  scheduledAt: Date | string;
  agentUserId: string | null;
  agents: AgentOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const { timezone } = useOrg();
  const [open, setOpen] = useState(false);
  const defaults = () => ({ ...localPartsInZone(scheduledAt, timezone), agentUserId: agentUserId ?? "" });
  const { form, onSubmit, pending } = useActionForm({
    schema: viewingRescheduleSchema,
    defaultValues: defaults(),
    action: (v) => rescheduleViewingAction(viewingId, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(defaults());
      }}
      trigger={trigger}
      title="Reschedule viewing"
      description={`Times are in ${timezone}.`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormGrid>
          <TextField control={c} name="date" label="Date" type="date" required />
          <TextField control={c} name="time" label="Time" type="time" required />
        </FormGrid>
        <SelectField control={c} name="agentUserId" label="Agent" allowEmpty="No agent" options={agents.map((a) => ({ value: a.id, label: a.name }))} />
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

export function ViewingOutcomeDialog({
  viewingId,
  status,
  feedback,
  trigger,
}: {
  viewingId: string;
  status: "COMPLETED" | "CANCELLED" | "NO_SHOW";
  feedback?: string | null;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { form, onSubmit, pending } = useActionForm({
    schema: viewingOutcomeSchema,
    defaultValues: { status, feedback: feedback ?? "" },
    action: (v) => recordViewingOutcomeAction(viewingId, v),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const title = status === "COMPLETED" ? (feedback !== undefined && feedback !== null ? "Viewing feedback" : "Mark viewing completed") : `Mark as ${viewingStatusLabels[status].toLowerCase()}`;
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ status, feedback: feedback ?? "" });
      }}
      trigger={trigger}
      title={title}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextareaField
          control={form.control}
          name="feedback"
          label={status === "COMPLETED" ? "Client feedback" : "Note"}
          rows={4}
          placeholder={status === "COMPLETED" ? "Liked the layout, concerned about parking, wants a second visit…" : "Optional"}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending} variant={status === "COMPLETED" ? "default" : "destructive"}>
            Save
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
