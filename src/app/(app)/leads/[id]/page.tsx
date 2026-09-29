import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarPlus, Handshake, Mail, MessageCircle, Pencil, Phone, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge } from "@/components/shared/status-badge";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { LeadActivityFeed } from "@/components/real-estate/lead-activity";
import { ArchiveLeadButton, AssignLeadDialog, FollowUpDialog } from "@/components/real-estate/lead-dialogs";
import { FollowUpBadge } from "@/components/real-estate/lead-list";
import { LeadStagePipeline } from "@/components/real-estate/lead-stage";
import { ScheduleViewingDialog } from "@/components/real-estate/viewing-dialogs";
import { ViewingList } from "@/components/real-estate/viewing-list";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getLead } from "@/services/real-estate/lead-service";
import { listListingOptions } from "@/services/real-estate/listing-service";
import { listAgentOptions } from "@/services/real-estate/shared";
import {
  dealStageLabels,
  dealStageTones,
  leadSourceLabels,
  leadStageLabels,
  leadStageTones,
  listingStatusLabels,
  listingStatusTones,
  whatsappHref,
} from "@/config/real-estate-labels";

export default async function LeadDetailPage({ params }: PageProps<"/leads/[id]">) {
  const ctx = await requireTenantPage("leads.view");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Leads" canEnable={can(ctx, "settings.organization")} />;
  const { id } = await params;
  const lead = await loadOr404(getLead(ctx, id));
  const { currency, locale, timezone } = ctx.organization;
  const { canManage, isOpen } = lead.access;
  const [agents, listings] = await Promise.all([
    canManage ? listAgentOptions(ctx) : Promise.resolve([]),
    canManage && isOpen ? listListingOptions(ctx) : Promise.resolve([]),
  ]);
  const wa = whatsappHref(lead.phone, `Hi ${lead.name.split(" ")[0]}, `);
  const budget =
    lead.budgetMin != null || lead.budgetMax != null
      ? [lead.budgetMin != null ? formatMoney(lead.budgetMin, currency, locale) : "…", lead.budgetMax != null ? formatMoney(lead.budgetMax, currency, locale) : "…"].join(" – ")
      : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {lead.name}
            <EnumBadge value={lead.stage} labels={leadStageLabels} tones={leadStageTones} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{lead.code}</span>
            <span>{leadSourceLabels[lead.source]}</span>
            <span>Added {formatDateTime(lead.createdAt, timezone, locale)}</span>
          </span>
        }
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: lead.code }]}
        actions={
          <>
            {lead.phone ? (
              <Button asChild variant="outline">
                <a href={`tel:${lead.phone}`}>
                  <Phone />
                  Call
                </a>
              </Button>
            ) : null}
            {wa ? (
              <Button asChild variant="outline">
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
            ) : null}
            {lead.email ? (
              <Button asChild variant="outline">
                <a href={`mailto:${lead.email}`}>
                  <Mail />
                  Email
                </a>
              </Button>
            ) : null}
            {canManage && isOpen ? (
              <ScheduleViewingDialog
                leadId={lead.id}
                leads={[{ id: lead.id, code: lead.code, name: lead.name, phone: lead.phone, listingId: lead.listingId, assignedUserId: lead.assignedUserId }]}
                listings={listings}
                agents={agents}
                trigger={
                  <Button variant="outline">
                    <CalendarPlus />
                    Schedule viewing
                  </Button>
                }
              />
            ) : null}
            {lead.access.canCreateDeal && isOpen ? (
              <Button asChild variant="outline">
                <Link href={`/deals/new?leadId=${lead.id}`}>
                  <Handshake />
                  Create deal
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button asChild>
                <Link href={`/leads/${lead.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {lead.duplicates.length ? (
        <div role="status" className="mb-4 flex gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            Possible duplicate of{" "}
            {lead.duplicates.map((d, i) => (
              <span key={d.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/leads/${d.id}`} className="font-medium underline-offset-2 hover:underline">
                  {d.name} ({d.code})
                </Link>
              </span>
            ))}{" "}
            — same phone or email on an open lead.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Stage</h2>
            <LeadStagePipeline leadId={lead.id} stage={lead.stage} canManage={canManage} />
            {lead.stage === "LOST" && lead.lostReason ? (
              <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
                <span className="font-medium">Lost reason:</span> {lead.lostReason}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Activity</h2>
            <LeadActivityFeed leadId={lead.id} items={lead.activities} canManage={canManage} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Viewings</h2>
            <ViewingList items={lead.viewings.map((v) => ({ ...v, lead: { id: lead.id, code: lead.code, name: lead.name } }))} canManage={canManage} agents={agents} showLead={false} empty="No viewings yet." />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Contact & requirement</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd>{lead.phone ? <a href={`tel:${lead.phone}`} className="hover:text-primary">{lead.phone}</a> : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="truncate">{lead.email ? <a href={`mailto:${lead.email}`} className="hover:text-primary">{lead.email}</a> : "—"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Looking to</dt>
                  <dd>{lead.interest === "SALE" ? "Buy" : lead.interest === "RENT" ? "Rent" : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Preferred location</dt>
                  <dd>{lead.preferredLocation ?? "—"}</dd>
                </div>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Budget</dt>
                <dd className="tabular">{budget ?? "—"}</dd>
              </div>
              {lead.message ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Client&apos;s message</dt>
                  <dd className="whitespace-pre-line">{lead.message}</dd>
                </div>
              ) : null}
              {lead.notes ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Internal notes</dt>
                  <dd className="whitespace-pre-line">{lead.notes}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Ownership</h2>
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Assigned to</dt>
                  <dd>{lead.assignedTo?.name ?? "Unassigned"}</dd>
                </div>
                {canManage ? (
                  <AssignLeadDialog
                    leadId={lead.id}
                    assignedUserId={lead.assignedUserId}
                    agents={agents}
                    trigger={
                      <Button size="sm" variant="ghost">
                        <UserPlus />
                        {lead.assignedTo ? "Change" : "Assign"}
                      </Button>
                    }
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Next follow-up</dt>
                  <dd>{lead.nextFollowUpAt ? <FollowUpBadge date={lead.nextFollowUpAt} stage={lead.stage} /> : "Not set"}</dd>
                </div>
                {canManage ? (
                  <FollowUpDialog
                    leadId={lead.id}
                    current={lead.nextFollowUpAt}
                    trigger={
                      <Button size="sm" variant="ghost">
                        <CalendarClock />
                        {lead.nextFollowUpAt ? "Change" : "Set"}
                      </Button>
                    }
                  />
                ) : null}
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last contacted</dt>
                <dd>{lead.lastContactedAt ? formatDateTime(lead.lastContactedAt, timezone, locale) : "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Listing</h2>
            {lead.listing ? (
              <div className="flex flex-col gap-1 text-sm">
                {lead.access.canSeeListings ? (
                  <Link href={`/listings/${lead.listing.id}`} className="font-medium hover:text-primary">
                    {lead.listing.title}
                  </Link>
                ) : (
                  <span className="font-medium">{lead.listing.title}</span>
                )}
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{lead.listing.code}</span>
                  <span className="tabular">{formatMoney(lead.listing.price, currency, locale)}</span>
                  <EnumBadge value={lead.listing.status} labels={listingStatusLabels} tones={listingStatusTones} />
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No specific listing.</p>
            )}
          </section>

          {lead.access.canSeeDeals ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Deals</h2>
              {lead.deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deals yet.</p>
              ) : (
                <ul className="divide-y">
                  {lead.deals.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <Link href={`/deals/${d.id}`} className="hover:text-primary">
                        <span className="font-mono text-xs">{d.code}</span>{" "}
                        <span className="tabular">{formatMoney(d.agreedAmount, currency, locale)}</span>
                      </Link>
                      <EnumBadge value={d.stage} labels={dealStageLabels} tones={dealStageTones} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {canManage ? <ArchiveLeadButton leadId={lead.id} /> : null}
        </aside>
      </div>
    </>
  );
}
