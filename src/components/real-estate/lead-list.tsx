"use client";

import Link from "next/link";
import { CalendarClock, MessageCircle, Phone, Users } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge, StatusBadge, dotClasses } from "@/components/shared/status-badge";
import { useFormatters, useOrg } from "@/components/shared/org-context";
import { leadSourceLabels, leadStageLabels, leadStageTones, whatsappHref } from "@/config/real-estate-labels";
import type { LeadSource, LeadStage, ListingPurpose } from "@/generated/prisma/enums";
import { formatRelative, todayInTimeZone } from "@/lib/format";
import type { Paginated } from "@/lib/validation/common";
import { cn } from "@/lib/utils";
import { LeadStageSelect } from "./lead-stage";

export type LeadRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  stage: LeadStage;
  interest: ListingPurpose | null;
  budgetMin: number | null;
  budgetMax: number | null;
  nextFollowUpAt: Date | string | null;
  createdAt: Date | string;
  listing: { id: string; code: string; title: string } | null;
  assignedTo: { id: string; name: string } | null;
  _count: { viewings: number; activities: number };
};

const OPEN: LeadStage[] = ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION"];

/** "Due today" / "Overdue" / date badge for a follow-up (calendar day, org time zone). */
export function FollowUpBadge({ date, stage }: { date: Date | string | null; stage: LeadStage }) {
  const { timezone } = useOrg();
  const fmt = useFormatters();
  if (!date) return null;
  const day = (typeof date === "string" ? new Date(date) : date).toISOString().slice(0, 10);
  const today = todayInTimeZone(timezone);
  if (!OPEN.includes(stage)) return <span className="text-xs text-muted-foreground">{fmt.date(date)}</span>;
  if (day < today) return <StatusBadge tone="danger">Overdue · {fmt.date(date)}</StatusBadge>;
  if (day === today) return <StatusBadge tone="warning">Due today</StatusBadge>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CalendarClock className="size-3" />
      {fmt.date(date)}
    </span>
  );
}

export function ContactButtons({ phone, name, className }: { phone: string | null; name: string; className?: string }) {
  if (!phone) return null;
  const wa = whatsappHref(phone, `Hi ${name.split(" ")[0]}, `);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <a href={`tel:${phone}`} className="flex size-7 items-center justify-center rounded-md border hover:bg-accent" aria-label={`Call ${name}`}>
        <Phone className="size-3.5" />
      </a>
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="flex size-7 items-center justify-center rounded-md border text-success hover:bg-accent"
          aria-label={`WhatsApp ${name}`}
        >
          <MessageCircle className="size-3.5" />
        </a>
      ) : null}
    </span>
  );
}

export type LeadBoardColumn = { stage: LeadStage; items: LeadRow[]; total: number };

/** Kanban board by stage. Stage changes use the select on each card; scrolls sideways on phones. */
export function LeadBoard({ columns, canManage }: { columns: LeadBoardColumn[]; canManage: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1320px] grid-cols-6 gap-3">
        {columns.map((col) => (
          <section key={col.stage} className="flex min-h-40 flex-col rounded-xl border bg-muted/30" aria-label={leadStageLabels[col.stage]}>
            <header className="flex items-center gap-2 border-b px-3 py-2.5">
              <span className={cn("size-2 rounded-full", dotClasses[leadStageTones[col.stage]])} />
              <h2 className="text-sm font-semibold">{leadStageLabels[col.stage]}</h2>
              <span className="ms-auto rounded-full bg-background px-2 text-xs tabular text-muted-foreground">{col.total}</span>
            </header>
            <div className="flex flex-col gap-2 p-2">
              {col.items.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">No leads</p>
              ) : (
                col.items.map((l) => (
                  <article key={l.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/leads/${l.id}`} className="min-w-0 hover:text-primary">
                        <span className="block truncate font-medium">{l.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
                      </Link>
                      <ContactButtons phone={l.phone} name={l.name} />
                    </div>
                    {l.listing ? <p className="truncate text-xs text-muted-foreground">{l.listing.title}</p> : null}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{leadSourceLabels[l.source]}</span>
                      <FollowUpBadge date={l.nextFollowUpAt} stage={l.stage} />
                      <span className="ms-auto">{formatRelative(l.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs">{l.assignedTo?.name ?? <span className="text-muted-foreground">Unassigned</span>}</span>
                      {canManage ? <LeadStageSelect leadId={l.id} stage={l.stage} className="h-7 min-w-28 text-xs" /> : null}
                    </div>
                  </article>
                ))
              )}
              {col.total > col.items.length ? (
                <Link href={`/leads?view=list&stage=${col.stage}`} className="px-1 py-1 text-center text-xs text-muted-foreground hover:text-primary">
                  View all {col.total}
                </Link>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function LeadTable({ data, toolbar, empty }: { data: Paginated<LeadRow>; toolbar?: React.ReactNode; empty: React.ReactNode }) {
  const fmt = useFormatters();
  const budget = (l: LeadRow) =>
    l.budgetMin != null || l.budgetMax != null
      ? [l.budgetMin != null ? fmt.money(l.budgetMin) : null, l.budgetMax != null ? fmt.money(l.budgetMax) : null].filter(Boolean).join(" – ")
      : null;
  const columns: Column<LeadRow>[] = [
    {
      id: "lead",
      header: "Lead",
      hideable: false,
      sortKey: "name",
      cell: (l) => (
        <Link href={`/leads/${l.id}`} className="flex min-w-0 flex-col hover:text-primary">
          <span className="truncate font-medium">{l.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
        </Link>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      cell: (l) => (
        <span className="flex items-center gap-2">
          <span className="flex min-w-0 flex-col text-xs">
            {l.phone ? <span>{l.phone}</span> : null}
            {l.email ? <span className="truncate text-muted-foreground">{l.email}</span> : null}
          </span>
          <ContactButtons phone={l.phone} name={l.name} />
        </span>
      ),
    },
    { id: "source", header: "Source", cell: (l) => leadSourceLabels[l.source] },
    { id: "listing", header: "Listing", cell: (l) => (l.listing ? <span className="line-clamp-1">{l.listing.title}</span> : <span className="text-muted-foreground">—</span>) },
    { id: "budget", header: "Budget", defaultHidden: true, cell: (l) => budget(l) ?? <span className="text-muted-foreground">—</span> },
    { id: "assigned", header: "Assigned to", cell: (l) => l.assignedTo?.name ?? <span className="text-muted-foreground">Unassigned</span> },
    { id: "followUp", header: "Follow-up", sortKey: "nextFollowUpAt", cell: (l) => <FollowUpBadge date={l.nextFollowUpAt} stage={l.stage} /> },
    { id: "created", header: "Added", sortKey: "createdAt", cell: (l) => <span title={fmt.dateTime(l.createdAt)}>{formatRelative(l.createdAt)}</span> },
    { id: "stage", header: "Stage", sortKey: "stage", cell: (l) => <EnumBadge value={l.stage} labels={leadStageLabels} tones={leadStageTones} /> },
  ];
  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(l) => l.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(l) => `/leads/${l.id}`}
      hideSearch
      storageKey="leads"
      toolbar={toolbar}
      empty={empty}
      mobileCard={(l) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{l.code}</span> · {leadSourceLabels[l.source]}
              </p>
            </div>
            <EnumBadge value={l.stage} labels={leadStageLabels} tones={leadStageTones} />
          </div>
          {l.listing ? <p className="truncate text-xs text-muted-foreground">{l.listing.title}</p> : null}
          <div className="flex items-center justify-between gap-2 text-xs">
            <FollowUpBadge date={l.nextFollowUpAt} stage={l.stage} />
            <ContactButtons phone={l.phone} name={l.name} className="ms-auto" />
          </div>
        </div>
      )}
    />
  );
}

export function LeadEmpty({ filtered, action }: { filtered: boolean; action?: React.ReactNode }) {
  return (
    <EmptyState
      icon={Users}
      title={filtered ? "No leads match your filters" : "No leads yet"}
      description="Enquiries from calls, walk-ins, WhatsApp and your public listings page appear here."
      action={action}
    />
  );
}
