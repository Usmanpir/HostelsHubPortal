import Link from "next/link";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge } from "@/components/shared/status-badge";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { CommissionPaidButton, DealStageButtons } from "@/components/real-estate/deal-actions";
import { DealHistory } from "@/components/real-estate/deal-history";
import { CommissionBadge } from "@/components/real-estate/deal-list";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { termsFor } from "@/lib/terms";
import { getDeal } from "@/services/real-estate/deal-service";
import {
  dealStageLabels,
  dealStageTones,
  dealTypeLabels,
  dealTypeTones,
  leadStageLabels,
  leadStageTones,
  listingStatusLabels,
  listingStatusTones,
} from "@/config/real-estate-labels";

export default async function DealDetailPage({ params }: PageProps<"/deals/[id]">) {
  const ctx = await requireTenantPage("deals.view");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Deals" canEnable={can(ctx, "settings.organization")} />;
  const { id } = await params;
  const d = await loadOr404(getDeal(ctx, id));
  const { currency, locale, timezone } = ctx.organization;
  const money = (n: number) => formatMoney(n, currency, locale);
  const terms = termsFor(ctx.organization.businessType);
  const links = { lead: !!d.lead, listing: !!d.listing };

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {d.clientName}
            <EnumBadge value={d.stage} labels={dealStageLabels} tones={dealStageTones} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{d.code}</span>
            <EnumBadge value={d.type} labels={dealTypeLabels} tones={dealTypeTones} />
            <span>Created {formatDateTime(d.createdAt, timezone, locale)}</span>
          </span>
        }
        breadcrumbs={[{ label: "Deals", href: "/deals" }, { label: d.code }]}
        actions={
          d.access.canEdit ? (
            <Button asChild variant="outline">
              <Link href={`/deals/${d.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {d.access.allowedStages.length ? (
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div>
                <h2 className="text-sm font-semibold">Move this deal forward</h2>
                <p className="text-sm text-muted-foreground">Currently {dealStageLabels[d.stage].toLowerCase()}.</p>
              </div>
              <DealStageButtons dealId={d.id} stage={d.stage} type={d.type} allowed={d.access.allowedStages} links={links} />
            </section>
          ) : null}

          {d.moveIn && d.stage !== "CLOSED_LOST" ? (
            <section className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-accent/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  Create {terms.resident.toLowerCase()} & {terms.checkIn.toLowerCase()}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {d.listing?.room ? `${terms.unit} ${d.listing.room.roomNumber}` : terms.unit}
                  {d.listing?.hostel ? ` · ${d.listing.hostel.name}` : ""} is one of your managed {terms.units.toLowerCase()}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.moveIn.canCreateTenant ? (
                  <Button asChild variant="outline">
                    <Link href="/residents/new">
                      <UserPlus />
                      Create {terms.resident.toLowerCase()}
                    </Link>
                  </Button>
                ) : null}
                {d.moveIn.canCheckIn ? (
                  <Button asChild>
                    <Link href={`/residents/check-in?bedId=${d.moveIn.bedId}`}>
                      <KeyRound />
                      {terms.checkIn}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Notes</h2>
            {d.notes ? <p className="text-sm whitespace-pre-line">{d.notes}</p> : <p className="text-sm text-muted-foreground">No notes.</p>}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">History</h2>
            <DealHistory items={d.timeline} />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{d.type === "RENT" ? "Agreed monthly rent" : "Agreed price"}</p>
            <p className="tabular text-2xl font-semibold tracking-tight">{money(d.agreedAmount)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Commission</dt>
                <dd className="tabular font-medium">{money(d.commissionAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Rate</dt>
                <dd className="tabular">{d.commissionPercent}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Expected closing</dt>
                <dd>{formatDate(d.expectedCloseDate, locale)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Closed</dt>
                <dd>{d.closedAt ? formatDateTime(d.closedAt, timezone, locale) : "—"}</dd>
              </div>
            </dl>
            {d.stage === "CLOSED_WON" && d.commissionAmount > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <span className="flex flex-col gap-1 text-sm">
                  <CommissionBadge deal={d} />
                  {d.commissionPaidAt ? <span className="text-xs text-muted-foreground">Paid {formatDate(d.commissionPaidAt, locale)}</span> : null}
                </span>
                {d.access.canMarkCommission ? <CommissionPaidButton dealId={d.id} paid={!!d.commissionPaidAt} /> : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Parties</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Lead</dt>
                <dd>
                  {d.lead ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {d.access.canSeeLead ? (
                        <Link href={`/leads/${d.lead.id}`} className="hover:text-primary">
                          {d.lead.name}
                        </Link>
                      ) : (
                        <span>{d.lead.name}</span>
                      )}
                      <EnumBadge value={d.lead.stage} labels={leadStageLabels} tones={leadStageTones} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                  {d.lead?.phone ? (
                    <a href={`tel:${d.lead.phone}`} className="block text-xs text-muted-foreground hover:text-primary">
                      {d.lead.phone}
                    </a>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Listing</dt>
                <dd>
                  {d.listing ? (
                    <span className="flex flex-col gap-1">
                      {d.access.canSeeListing ? (
                        <Link href={`/listings/${d.listing.id}`} className="hover:text-primary">
                          {d.listing.title}
                        </Link>
                      ) : (
                        <span>{d.listing.title}</span>
                      )}
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{d.listing.code}</span>
                        <EnumBadge value={d.listing.status} labels={listingStatusLabels} tones={listingStatusTones} />
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Agent</dt>
                <dd>{d.agent?.name ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
