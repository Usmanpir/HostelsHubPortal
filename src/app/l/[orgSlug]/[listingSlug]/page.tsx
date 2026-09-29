import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bath, BedDouble, Check, Home, MapPin, Ruler, Sofa, Tag } from "lucide-react";
import { Gallery } from "@/components/public/gallery";
import { InquiryForm } from "@/components/public/inquiry-form";
import { ListingBadges } from "@/components/public/listing-badges";
import { ListingCard } from "@/components/public/listing-card";
import { ContactButtons } from "@/components/public/org-header";
import {
  absoluteUrl,
  appOrigin,
  formatArea,
  formatListingPrice,
  formatPlace,
  listingPath,
  listingPhotoUrl,
  PROPERTY_TYPE_LABEL,
  PURPOSE_LABEL,
} from "@/components/public/format";
import { loadPublicListing } from "../data";
import { submitInquiryAction } from "./actions";

type Props = { params: Promise<{ orgSlug: string; listingSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, listingSlug } = await params;
  const { org, listing } = await loadPublicListing(orgSlug, listingSlug);
  const place = formatPlace(listing);
  const title = `${listing.title} · ${org.displayName}`;
  const summary = [PURPOSE_LABEL[listing.purpose], formatListingPrice(listing, org), place].filter(Boolean).join(" · ");
  const body = listing.description?.replace(/\s+/g, " ").trim();
  const description = (body ? `${summary}. ${body}` : summary).slice(0, 200);
  const path = listingPath(org.slug, listing.slug);
  const origin = appOrigin();
  const images = listing.photoIds.slice(0, 4).map((id) => ({ url: absoluteUrl(listingPhotoUrl(listing.id, id)), alt: listing.title }));
  return {
    title: { absolute: title },
    description,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    alternates: { canonical: path },
    openGraph: { type: "website", title, description, siteName: org.displayName, url: absoluteUrl(path), images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description },
  };
}

export default async function PublicListingPage({ params }: Props) {
  const { orgSlug, listingSlug } = await params;
  const { org, listing, more } = await loadPublicListing(orgSlug, listingSlug);
  const place = formatPlace(listing);
  const area = formatArea(listing, org.locale);
  const photos = listing.photoIds.map((id) => listingPhotoUrl(listing.id, id));

  const facts: { icon: typeof Home; label: string; value: string }[] = [
    { icon: Home, label: "Type", value: PROPERTY_TYPE_LABEL[listing.propertyType] },
    { icon: Tag, label: "Purpose", value: PURPOSE_LABEL[listing.purpose] },
    ...(listing.bedrooms ? [{ icon: BedDouble, label: "Bedrooms", value: String(listing.bedrooms) }] : []),
    ...(listing.bathrooms ? [{ icon: Bath, label: "Bathrooms", value: String(listing.bathrooms) }] : []),
    ...(area ? [{ icon: Ruler, label: "Area", value: area }] : []),
    { icon: Sofa, label: "Furnished", value: listing.furnished ? "Yes" : "No" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Offer",
    name: listing.title,
    url: absoluteUrl(listingPath(org.slug, listing.slug)),
    price: listing.price,
    priceCurrency: org.currency,
    seller: { "@type": "RealEstateAgent", name: org.displayName },
    ...(photos[0] ? { image: absoluteUrl(photos[0]) } : {}),
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      <script
        type="application/ld+json"
        // JSON.stringify + "<" escaping keeps user text from closing the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav aria-label="Breadcrumb">
        <Link
          href={`/l/${org.slug}`}
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          All properties from {org.displayName}
        </Link>
      </nav>

      <Gallery title={listing.title} photos={photos} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="flex min-w-0 flex-col gap-8">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              <ListingBadges purpose={listing.purpose} status={listing.status} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{listing.title}</h1>
            {place || listing.address ? (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{[listing.address, place].filter(Boolean).join(" · ")}</span>
              </p>
            ) : null}
            <p className="text-2xl font-semibold text-primary">
              {formatListingPrice(listing, org)}
              {listing.priceNegotiable ? (
                <span className="ms-2 align-middle text-sm font-normal text-muted-foreground">Negotiable</span>
              ) : null}
            </p>
          </header>

          <section aria-labelledby="facts-title">
            <h2 id="facts-title" className="sr-only">
              Key facts
            </h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="truncate text-sm font-medium">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </section>

          {listing.description ? (
            <section aria-labelledby="desc-title" className="flex flex-col gap-3">
              <h2 id="desc-title" className="text-lg font-semibold">
                About this property
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{listing.description}</p>
            </section>
          ) : null}

          {listing.features.length ? (
            <section aria-labelledby="features-title" className="flex flex-col gap-3">
              <h2 id="features-title" className="text-lg font-semibold">
                Features
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {listing.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {place || listing.address ? (
            <section aria-labelledby="location-title" className="flex flex-col gap-3">
              <h2 id="location-title" className="text-lg font-semibold">
                Location
              </h2>
              <p className="text-sm text-muted-foreground">
                {[listing.address, listing.locality, listing.city].filter(Boolean).join(", ")}
              </p>
            </section>
          ) : null}
        </article>

        <aside aria-labelledby="inquiry-title" className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div>
              <h2 id="inquiry-title" className="text-lg font-semibold">
                Ask about this property
              </h2>
              <p className="text-sm text-muted-foreground">{org.displayName} usually replies within a day.</p>
            </div>
            <InquiryForm
              orgSlug={org.slug}
              listingSlug={listing.slug}
              listingTitle={listing.title}
              orgName={org.displayName}
              action={submitInquiryAction}
            />
            {org.phone || org.email ? (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <ContactButtons org={org} />
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {more.length ? (
        <section aria-labelledby="more-title" className="flex flex-col gap-5 border-t pt-8">
          <h2 id="more-title" className="text-lg font-semibold">
            More from {org.displayName}
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((item) => (
              <li key={item.id} className="flex [&>article]:w-full">
                <ListingCard listing={item} org={org} headingLevel="h3" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
