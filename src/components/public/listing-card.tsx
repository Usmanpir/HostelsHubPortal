import Link from "next/link";
import { Bath, BedDouble, ImageOff, MapPin, Ruler } from "lucide-react";
import type { AreaUnit, ListingPropertyType, ListingPurpose, ListingStatus } from "@/generated/prisma/enums";
import {
  formatArea,
  formatListingPrice,
  formatPlace,
  listingPath,
  listingPhotoUrl,
  PROPERTY_TYPE_LABEL,
} from "./format";
import { ListingBadges } from "./listing-badges";

export type ListingCardData = {
  id: string;
  slug: string;
  title: string;
  purpose: ListingPurpose;
  propertyType: ListingPropertyType;
  status: ListingStatus;
  price: number;
  priceNegotiable: boolean;
  areaValue: number | null;
  areaUnit: AreaUnit | null;
  bedrooms: number | null;
  bathrooms: number | null;
  locality: string | null;
  city: string | null;
  coverFileId: string | null;
};

export function ListingCard({
  listing,
  org,
  headingLevel = "h2",
}: {
  listing: ListingCardData;
  org: { slug: string; currency: string; locale: string };
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const area = formatArea(listing, org.locale);
  const place = formatPlace(listing);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {listing.coverFileId ? (
          // eslint-disable-next-line @next/next/no-img-element -- authorized public image route, cached upstream
          <img
            src={listingPhotoUrl(listing.id, listing.coverFileId)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" aria-hidden />
            <span className="sr-only">No photo</span>
          </div>
        )}
        <div className="absolute inset-s-3 top-3 flex flex-wrap gap-1.5">
          <ListingBadges purpose={listing.purpose} status={listing.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-lg font-semibold tracking-tight text-foreground">
          {formatListingPrice(listing, org)}
          {listing.priceNegotiable ? (
            <span className="ms-2 align-middle text-xs font-normal text-muted-foreground">Negotiable</span>
          ) : null}
        </p>
        <Heading className="line-clamp-2 text-sm font-medium leading-snug">
          <Link
            href={listingPath(org.slug, listing.slug)}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {listing.title}
          </Link>
        </Heading>
        <p className="text-xs text-muted-foreground">{PROPERTY_TYPE_LABEL[listing.propertyType]}</p>
        {place ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{place}</span>
          </p>
        ) : null}
        <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          {listing.bedrooms ? (
            <li className="flex items-center gap-1">
              <BedDouble className="size-3.5" aria-hidden />
              {listing.bedrooms} bed{listing.bedrooms === 1 ? "" : "s"}
            </li>
          ) : null}
          {listing.bathrooms ? (
            <li className="flex items-center gap-1">
              <Bath className="size-3.5" aria-hidden />
              {listing.bathrooms} bath{listing.bathrooms === 1 ? "" : "s"}
            </li>
          ) : null}
          {area ? (
            <li className="flex items-center gap-1">
              <Ruler className="size-3.5" aria-hidden />
              {area}
            </li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}
