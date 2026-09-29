"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, CircleSlash, MapPin, MessageSquareText, Phone, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useFormatters, useOrg } from "@/components/shared/org-context";
import { viewingStatusLabels, viewingStatusTones } from "@/config/real-estate-labels";
import type { ViewingStatus } from "@/generated/prisma/enums";
import { formatTime } from "@/lib/format";
import { RescheduleViewingDialog, ViewingOutcomeDialog, type AgentOption } from "./viewing-dialogs";

export type ViewingItem = {
  id: string;
  scheduledAt: Date | string;
  status: ViewingStatus;
  feedback: string | null;
  agentUserId?: string | null;
  lead: { id: string; code: string; name: string; phone?: string | null };
  listing?: { id: string; code: string; title: string; locality?: string | null; city?: string | null };
  agent: { id: string; name: string } | null;
};

export function ViewingList({
  items,
  canManage,
  agents = [],
  showLead = true,
  showListing = true,
  timeOnly = false,
  empty = "No viewings.",
}: {
  items: ViewingItem[];
  canManage: boolean;
  agents?: AgentOption[];
  showLead?: boolean;
  showListing?: boolean;
  /** Show only the time (for the "Today" group). */
  timeOnly?: boolean;
  empty?: string;
}) {
  const fmt = useFormatters();
  const { timezone, locale } = useOrg();
  // Captured once per mount: used only to flag past viewings that still need an outcome.
  const [now] = useState(() => Date.now());
  if (items.length === 0) return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card">
      {items.map((v) => {
        const at = new Date(v.scheduledAt);
        const overdue = v.status === "SCHEDULED" && at.getTime() < now;
        const place = v.listing ? [v.listing.locality, v.listing.city].filter(Boolean).join(", ") : "";
        return (
          <li key={v.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:flex-col sm:items-start sm:gap-0.5">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular">
                <CalendarClock className="size-4 text-muted-foreground" />
                {timeOnly ? formatTime(at, timezone, locale) : fmt.dateTime(at)}
              </span>
              <span className="flex items-center gap-1.5">
                <EnumBadge value={v.status} labels={viewingStatusLabels} tones={viewingStatusTones} />
                {overdue ? <StatusBadge tone="warning">Needs outcome</StatusBadge> : null}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              {showListing && v.listing ? (
                <Link href={`/listings/${v.listing.id}`} className="truncate font-medium hover:text-primary">
                  <span className="font-mono text-xs text-muted-foreground">{v.listing.code}</span> {v.listing.title}
                </Link>
              ) : null}
              {showLead ? (
                <span className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                  <Link href={`/leads/${v.lead.id}`} className="font-medium text-foreground hover:text-primary">
                    {v.lead.name}
                  </Link>
                  <span className="font-mono text-xs">{v.lead.code}</span>
                  {v.lead.phone ? (
                    <a href={`tel:${v.lead.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                      <Phone className="size-3" />
                      {v.lead.phone}
                    </a>
                  ) : null}
                </span>
              ) : null}
              <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <span>{v.agent ? `Agent: ${v.agent.name}` : "No agent"}</span>
                {place ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {place}
                  </span>
                ) : null}
              </span>
              {v.feedback ? (
                <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs whitespace-pre-line">
                  <MessageSquareText className="mt-0.5 size-3 shrink-0" />
                  {v.feedback}
                </p>
              ) : null}
            </div>
            {canManage && (v.status === "SCHEDULED" || v.status === "COMPLETED") ? (
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                {v.status === "SCHEDULED" ? (
                  <>
                    <ViewingOutcomeDialog
                      viewingId={v.id}
                      status="COMPLETED"
                      trigger={
                        <Button size="sm">
                          <CheckCircle2 />
                          Completed
                        </Button>
                      }
                    />
                    <ViewingOutcomeDialog
                      viewingId={v.id}
                      status="NO_SHOW"
                      trigger={
                        <Button size="sm" variant="outline">
                          <UserX />
                          No-show
                        </Button>
                      }
                    />
                    <ViewingOutcomeDialog
                      viewingId={v.id}
                      status="CANCELLED"
                      trigger={
                        <Button size="sm" variant="ghost">
                          <CircleSlash />
                          Cancel
                        </Button>
                      }
                    />
                    <RescheduleViewingDialog
                      viewingId={v.id}
                      scheduledAt={v.scheduledAt}
                      agentUserId={v.agent?.id ?? null}
                      agents={agents}
                      trigger={
                        <Button size="sm" variant="ghost">
                          <CalendarClock />
                          Reschedule
                        </Button>
                      }
                    />
                  </>
                ) : (
                  <ViewingOutcomeDialog
                    viewingId={v.id}
                    status="COMPLETED"
                    feedback={v.feedback ?? ""}
                    trigger={
                      <Button size="sm" variant="ghost">
                        <MessageSquareText />
                        Feedback
                      </Button>
                    }
                  />
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
