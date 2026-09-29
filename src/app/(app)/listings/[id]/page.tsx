import Link from "next/link";
import { Bath, BedDouble, CalendarPlus, ExternalLink, Handshake, MapPin, Pencil, Ruler, Sofa, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { ListingGallery } from "@/components/real-estate/listing-gallery";
import { ListingPublishSwitch, ListingStatusButtons } from "@/components/real-estate/listing-actions";
import { ScheduleViewingDialog } from "@/components/real-estate/viewing-dialogs";
import { ViewingList } from "@/components/real-estate/viewing-list";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { termsFor } from "@/lib/terms";
import { getListing } from "@/services/real-estate/listing-service";
import { listLeadOptions } from "@/services/real-estate/lead-service";
import { listAgentOptions } from "@/services/real-estate/shared";
import {
  dealStageLabels,
  dealStageTones,
  formatArea,
  leadStageLabels,
  leadStageTones,
  listingPropertyTypeLabels,
  listingPurposeLabels,
  listingPurposeTones,
  listingStatusLabels,
  listingStatusTones,
} from "@/config/real-estate-labels";

export default async function ListingDetailPage({ params }: PageProps<"/listings/[id]">) {
  const ctx = await requireTenantPage("listings.view");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Listings" canEnable={can(ctx, "settings.organization")} />;
  const { id } = await params;
  const l = await loadOr404(getListing(ctx, id));
  const { currency, locale } = ctx.organization;
  const terms = termsFor(ctx.organization.businessType);
  const available = l.status === "DRAFT" || l.status === "ACTIVE" || l.status === "UNDER_OFFER";
  const [leadOptions, agents] = await Promise.all([
    l.access.canScheduleViewing && available ? listLeadOptions(ctx) : Promise.resolve([]),
    l.access.canScheduleViewing && available ? listAgentOptions(ctx) : Promise.resolve([]),
  ]);
  const area = formatArea(l.areaValue, l.areaUnit);
  const place = [l.address, l.locality, l.city].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {l.title}
            <EnumBadge value={l.status} labels={listingStatusLabels} tones={listingStatusTones} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{l.code}</span>
            <EnumBadge value={l.purpose} labels={listingPurposeLabels} tones={listingPurposeTones} />
            <span>{listingPropertyTypeLabels[l.propertyType]}</span>
            {l.isPublished ? <StatusBadge tone="success">Published</StatusBadge> : null}
          </span>
        }
        breadcrumbs={[{ label: "Listings", href: "/listings" }, { label: l.code }]}
        actions={
          <>
            {l.publicUrl ? (
              <Button asChild variant="outline">
                <a href={l.publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  View on public page
                </a>
              </Button>
            ) : null}
            {l.access.canScheduleViewing && available ? (
              <ScheduleViewingDialog
                listingId={l.id}
                leads={leadOptions}
                listings={[{ id: l.id, code: l.code, title: l.title, status: l.status, agentUserId: l.agentUserId }]}
                agents={agents}
                trigger={
                  <Button variant="outline">
                    <CalendarPlus />
                    Schedule viewing
                  </Button>
                }
              />
            ) : null}
            {l.access.canCreateDeal && available ? (
              <Button asChild variant="outline">
                <Link href={`/deals/new?listingId=${l.id}`}>
                  <Handshake />
                  Create deal
                </Link>
              </Button>
            ) : null}
            {l.access.canManage && l.status !== "ARCHIVED" ? (
              <Button asChild>
                <Link href={`/listings/${l.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <ListingGallery listingId={l.id} title={l.title} photos={l.photos} coverFileId={l.coverFileId} canManage={l.access.canManage && l.status !== "ARCHIVED"} max={l.access.maxPhotos} />

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Description</h2>
            {l.description ? <p className="text-sm whitespace-pre-line">{l.description}</p> : <p className="text-sm text-muted-foreground">No description yet.</p>}
            {l.features.length ? (
              <>
                <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Features</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {l.features.map((f) => (
                    <li key={f} className="rounded-full border bg-accent/40 px-2.5 py-0.5 text-xs">
                      {f}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          {l.access.canSeeLeads ? (
            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Leads {l.leads.length ? <span className="text-muted-foreground">({l.leads.length})</span> : null}</h2>
                {can(ctx, "leads.manage") ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/leads/new?listingId=${l.id}`}>Add lead</Link>
                  </Button>
                ) : null}
              </div>
              {l.leads.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leads for this listing yet.</p>
              ) : (
                <ul className="divide-y">
                  {l.leads.map((lead) => (
                    <li key={lead.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link href={`/leads/${lead.id}`} className="min-w-0 hover:text-primary">
                        <span className="block truncate font-medium">{lead.name}</span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-mono">{lead.code}</span> · {lead.assignedTo?.name ?? "Unassigned"} · {formatRelative(lead.createdAt)}
                        </span>
                      </Link>
                      <EnumBadge value={lead.stage} labels={leadStageLabels} tones={leadStageTones} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {l.access.canSeeLeads ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Viewings</h2>
              <ViewingList items={l.viewings} canManage={can(ctx, "leads.manage")} agents={agents} showListing={false} empty="No viewings scheduled for this listing." />
            </section>
          ) : null}

          {l.access.canSeeDeals ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Deals</h2>
              {l.deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deals on this listing yet.</p>
              ) : (
                <ul className="divide-y">
                  {l.deals.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link href={`/deals/${d.id}`} className="min-w-0 hover:text-primary">
                        <span className="block truncate font-medium">{d.clientName}</span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-mono">{d.code}</span> · {formatMoney(d.agreedAmount, currency, locale)}
                        </span>
                      </Link>
                      <EnumBadge value={d.stage} labels={dealStageLabels} tones={dealStageTones} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{l.purpose === "RENT" ? "Monthly rent" : "Asking price"}</p>
            <p className="tabular text-2xl font-semibold tracking-tight">{formatMoney(l.price, currency, locale)}</p>
            {l.priceNegotiable ? <p className="text-xs text-muted-foreground">Negotiable</p> : null}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                { icon: Ruler, label: "Area", value: area },
                { icon: BedDouble, label: "Bedrooms", value: l.bedrooms },
                { icon: Bath, label: "Bathrooms", value: l.bathrooms },
                { icon: Sofa, label: "Furnished", value: l.furnished ? "Yes" : "No" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label}>
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className="size-3" />
                    {label}
                  </dt>
                  <dd>{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            {place ? (
              <p className="mt-4 flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {place}
              </p>
            ) : null}
          </section>

          {l.access.canManage ? (
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">Status</h2>
              <ListingStatusButtons listingId={l.id} status={l.status} allowed={l.access.allowedStatuses} />
              {l.status !== "ARCHIVED" ? (
                <ListingPublishSwitch listingId={l.id} published={l.isPublished} canPublish={l.access.canPublish} publicSiteEnabled={ctx.organization.publicListingsEnabled} />
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Agent</dt>
                <dd className="flex items-center gap-1.5">
                  <UserRound className="size-3.5 text-muted-foreground" />
                  {l.agent?.name ?? "Unassigned"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Managed {terms.property.toLowerCase()}</dt>
                <dd>
                  {l.hostel ? (
                    can(ctx, "hostels.view") && ctx.accessibleHostelIds.includes(l.hostel.id) ? (
                      <Link href={l.room ? `/hostels/rooms/${l.room.id}` : `/hostels/${l.hostel.id}`} className="hover:text-primary">
                        {l.hostel.name}
                        {l.room ? ` · ${terms.unit} ${l.room.roomNumber}` : ""}
                      </Link>
                    ) : (
                      <span>
                        {l.hostel.name}
                        {l.room ? ` · ${terms.unit} ${l.room.roomNumber}` : ""}
                      </span>
                    )
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Owner</dt>
                <dd>
                  {l.owner ? (
                    ctx.organization.ownersEnabled && can(ctx, "owners.view") ? (
                      <Link href={`/owners/${l.owner.id}`} className="hover:text-primary">
                        {l.owner.name}
                      </Link>
                    ) : (
                      <span>{l.owner.name}</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {l.owner?.phone ? (
                    <a href={`tel:${l.owner.phone}`} className="block text-xs text-muted-foreground hover:text-primary">
                      {l.owner.phone}
                    </a>
                  ) : null}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Listed</dt>
                  <dd>{formatDateTime(l.createdAt, ctx.organization.timezone, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Published</dt>
                  <dd>{l.isPublished && l.publishedAt ? formatDateTime(l.publishedAt, ctx.organization.timezone, locale) : "—"}</dd>
                </div>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
