import type { Metadata } from "next";
import { Building2, SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/public/listing-card";
import { ListingFilters } from "@/components/public/filters";
import { Pager } from "@/components/public/pager";
import { ContactButtons, OrgLogo } from "@/components/public/org-header";
import { absoluteUrl, appOrigin, orgLogoUrl } from "@/components/public/format";
import { sp } from "@/lib/page-helpers";
import { getPublicFilterOptions, listPublicListings } from "@/services/public/listings-service";
import type { PublicListingFilters } from "@/lib/validation/public";
import { loadPublicOrg } from "./data";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function describe(org: { displayName: string; city: string | null; intro: string | null }) {
  const intro = org.intro?.replace(/\s+/g, " ").slice(0, 160);
  return intro || `Browse properties for sale and rent from ${org.displayName}${org.city ? ` in ${org.city}` : ""}.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await loadPublicOrg(orgSlug);
  const title = `Properties by ${org.displayName}`;
  const description = describe(org);
  const origin = appOrigin();
  return {
    title: { absolute: title },
    description,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    alternates: { canonical: `/l/${org.slug}` },
    openGraph: {
      type: "website",
      title,
      description,
      siteName: org.displayName,
      url: absoluteUrl(`/l/${org.slug}`),
      ...(org.hasLogo ? { images: [{ url: absoluteUrl(orgLogoUrl(org.slug)) }] } : {}),
    },
    twitter: { card: "summary", title, description },
  };
}

/** Rebuild a query string from the effective filters (drops defaults and junk). */
function queryFor(filters: PublicListingFilters, page: number) {
  const q = new URLSearchParams();
  if (filters.purpose) q.set("purpose", filters.purpose);
  if (filters.type) q.set("type", filters.type);
  if (filters.location) q.set("location", filters.location);
  if (filters.minPrice !== undefined) q.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) q.set("maxPrice", String(filters.maxPrice));
  if (filters.beds !== undefined) q.set("beds", String(filters.beds));
  if (filters.sort !== "newest") q.set("sort", filters.sort);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function PublicListingsPage({ params, searchParams }: Props) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const org = await loadPublicOrg(orgSlug);
  const [result, options] = await Promise.all([
    listPublicListings(org, {
      purpose: sp(query, "purpose"),
      type: sp(query, "type"),
      location: sp(query, "location"),
      minPrice: sp(query, "minPrice"),
      maxPrice: sp(query, "maxPrice"),
      beds: sp(query, "beds"),
      sort: sp(query, "sort"),
      page: sp(query, "page"),
    }),
    getPublicFilterOptions(org.id),
  ]);
  const { items, total, filters, page, pageCount } = result;
  const basePath = `/l/${org.slug}`;
  const hasAnyListing = options.propertyTypes.length > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <section aria-labelledby="org-title" className="relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -end-24 size-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          <OrgLogo org={org} className="size-16" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <h1 id="org-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {org.displayName}
              </h1>
              {org.city ? <p className="text-sm text-muted-foreground">{org.city}</p> : null}
            </div>
            {org.intro ? (
              <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{org.intro}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <ContactButtons org={org} size="default" />
            </div>
          </div>
        </div>
      </section>

      {hasAnyListing ? (
        <ListingFilters
          basePath={basePath}
          filters={filters}
          propertyTypes={options.propertyTypes}
          locations={options.locations}
        />
      ) : null}

      <section aria-labelledby="results-title" className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="results-title" className="text-lg font-semibold">
            {hasAnyListing ? "Available properties" : "Properties"}
          </h2>
          {hasAnyListing ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {total} {total === 1 ? "property" : "properties"}
            </p>
          ) : null}
        </div>

        {!hasAnyListing ? (
          <EmptyState
            icon={Building2}
            title="No properties listed right now"
            description={`${org.displayName} hasn't published any properties yet. Get in touch to hear about new ones first.`}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No properties match your filters"
            description="Try widening your price range or clearing some filters."
            action={
              <Button asChild variant="outline">
                <Link href={basePath}>Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((listing) => (
              <li key={listing.id} className="flex [&>article]:w-full">
                <ListingCard listing={listing} org={org} />
              </li>
            ))}
          </ul>
        )}

        <Pager page={page} pageCount={pageCount} hrefFor={(p) => `${basePath}${queryFor(filters, p)}`} />
      </section>
    </div>
  );
}
