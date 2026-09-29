import Link from "next/link";
import { CheckCircle2, FileEdit, Globe, Handshake, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { ListingEmpty, ListingGrid, ListingTable } from "@/components/real-estate/listing-list";
import { ListingFilters, Pager } from "@/components/real-estate/listing-filters";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { getListingCounts, listListings } from "@/services/real-estate/listing-service";
import { LISTING_PROPERTY_TYPES, LISTING_PURPOSES, LISTING_SORTS, LISTING_STATUSES } from "@/lib/validation/real-estate";

export const metadata = { title: "Listings" };

function price(v: string | undefined) {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default async function ListingsPage({ searchParams }: PageProps<"/listings">) {
  const ctx = await requireTenantPage("listings.view");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Listings" canEnable={can(ctx, "settings.organization")} />;
  const params = await searchParams;
  const view = sp(params, "view") === "list" ? "list" : "grid";
  const filters = {
    q: sp(params, "q"),
    purpose: spEnum(params, "purpose", LISTING_PURPOSES),
    status: spEnum(params, "status", LISTING_STATUSES),
    propertyType: spEnum(params, "propertyType", LISTING_PROPERTY_TYPES),
    city: sp(params, "city"),
    minPrice: price(sp(params, "minPrice")),
    maxPrice: price(sp(params, "maxPrice")),
  };
  const [data, counts] = await Promise.all([
    listListings(ctx, {
      ...filters,
      sort: spEnum(params, "sort", LISTING_SORTS),
      dir: spEnum(params, "dir", ["asc", "desc"] as const),
      page: spNumber(params, "page", 1),
      pageSize: view === "grid" ? 24 : spNumber(params, "pageSize", 20),
    }),
    getListingCounts(ctx),
  ]);
  const canManage = can(ctx, "listings.manage");
  const filtered = Object.values(filters).some((v) => v !== undefined);
  const addButton = canManage ? (
    <Button asChild>
      <Link href="/listings/new">
        <Plus />
        Add listing
      </Link>
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Listings"
        description="Properties you are selling or renting out."
        breadcrumbs={[{ label: "Sales & leasing" }, { label: "Listings" }]}
        actions={addButton}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active" value={counts.active} icon={CheckCircle2} tone="success" hint="Available to clients" />
        <StatCard label="Under offer" value={counts.underOffer} icon={Handshake} tone="warning" hint="Deal in agreement" />
        <StatCard label="Drafts" value={counts.draft} icon={FileEdit} hint={`${counts.closed} sold or rented`} />
        <StatCard label="Published" value={counts.published} icon={Globe} tone="info" hint="Visible on your public page" />
      </div>
      <ListingFilters currency={ctx.organization.currency} />
      {view === "grid" ? (
        data.items.length === 0 ? (
          <ListingEmpty filtered={filtered} action={filtered ? null : addButton} />
        ) : (
          <>
            <ListingGrid rows={data.items} />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} />
          </>
        )
      ) : (
        <ListingTable data={data} filters={[]} empty={<ListingEmpty filtered={filtered} action={filtered ? null : addButton} />} />
      )}
    </>
  );
}
