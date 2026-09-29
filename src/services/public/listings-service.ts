import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingPropertyType, ListingPurpose } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/errors";
import { serialize } from "@/lib/serialize";
import { parseInput } from "@/lib/validation/parse";
import {
  isValidSlug,
  PUBLIC_PAGE_SIZE,
  publicListingFiltersSchema,
} from "@/lib/validation/public";

/**
 * Read-only data access for the public listings website (/l/[orgSlug]).
 *
 * Nothing here is tenant-authenticated, so every query:
 *  - goes through `publicOrgWhere` / `publicListingWhere` (the only definition of "public"),
 *  - selects an explicit allow-list of fields (never owner, agent, notes, codes or linked units).
 */

export const PUBLIC_LISTING_STATUSES = ["ACTIVE", "UNDER_OFFER"] as const;

/** An organization's public page is live only when both modules are on and the org is active. */
export function publicOrgWhere(slug: string): Prisma.OrganizationWhereInput {
  return { slug, status: "ACTIVE", deletedAt: null, dealerEnabled: true, publicListingsEnabled: true };
}

export function publicListingWhere(organizationId: string): Prisma.ListingWhereInput {
  return {
    organizationId,
    isPublished: true,
    status: { in: [...PUBLIC_LISTING_STATUSES] },
    archivedAt: null,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

const publicOrgSelect = {
  id: true,
  slug: true,
  name: true,
  brandName: true,
  logoFileId: true,
  primaryColor: true,
  publicProfileIntro: true,
  phone: true,
  email: true,
  city: true,
  currency: true,
  locale: true,
} satisfies Prisma.OrganizationSelect;

export type PublicOrg = {
  /** Internal id — used server-side only, never needed by client components. */
  id: string;
  slug: string;
  displayName: string;
  hasLogo: boolean;
  brandColor: string | null;
  intro: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  currency: string;
  locale: string;
};

/** Digits for a wa.me link (keeps a leading country code; strips everything else). */
export function whatsappNumber(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export async function getPublicOrg(slug: string): Promise<PublicOrg> {
  if (!isValidSlug(slug)) throw new NotFoundError("Page");
  const org = await prisma.organization.findFirst({ where: publicOrgWhere(slug), select: publicOrgSelect });
  if (!org) throw new NotFoundError("Page");
  return {
    id: org.id,
    slug: org.slug,
    displayName: org.brandName?.trim() || org.name,
    hasLogo: !!org.logoFileId,
    brandColor: org.primaryColor && HEX.test(org.primaryColor) ? org.primaryColor : null,
    intro: org.publicProfileIntro?.trim() || null,
    phone: org.phone,
    email: org.email,
    whatsapp: whatsappNumber(org.phone),
    city: org.city,
    currency: org.currency,
    locale: org.locale,
  };
}

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  purpose: true,
  propertyType: true,
  status: true,
  price: true,
  priceNegotiable: true,
  areaValue: true,
  areaUnit: true,
  bedrooms: true,
  bathrooms: true,
  furnished: true,
  locality: true,
  city: true,
  coverFileId: true,
  publishedAt: true,
} satisfies Prisma.ListingSelect;

const detailSelect = {
  ...cardSelect,
  description: true,
  features: true,
  address: true,
  updatedAt: true,
  photos: {
    where: { deletedAt: null, mimeType: { startsWith: "image/" } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.ListingSelect;

/** Accepts an org slug, or an org already loaded by `getPublicOrg` (saves a query). */
export async function listPublicListings(orgOrSlug: string | PublicOrg, rawFilters: Record<string, unknown> = {}) {
  const org = typeof orgOrSlug === "string" ? await getPublicOrg(orgOrSlug) : orgOrSlug;
  const filters = parseInput(publicListingFiltersSchema, rawFilters);

  const and: Prisma.ListingWhereInput[] = [publicListingWhere(org.id)];
  if (filters.purpose) and.push({ purpose: filters.purpose });
  if (filters.type) and.push({ propertyType: filters.type });
  if (filters.location) {
    and.push({
      OR: [
        { city: { contains: filters.location, mode: "insensitive" } },
        { locality: { contains: filters.location, mode: "insensitive" } },
      ],
    });
  }
  if (filters.minPrice !== undefined) and.push({ price: { gte: filters.minPrice } });
  if (filters.maxPrice !== undefined) and.push({ price: { lte: filters.maxPrice } });
  if (filters.beds !== undefined) and.push({ bedrooms: { gte: filters.beds } });
  const where: Prisma.ListingWhereInput = { AND: and };

  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    filters.sort === "price_asc"
      ? [{ price: "asc" }, { id: "asc" }]
      : filters.sort === "price_desc"
        ? [{ price: "desc" }, { id: "asc" }]
        : [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }];

  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      select: cardSelect,
      skip: (filters.page - 1) * PUBLIC_PAGE_SIZE,
      take: PUBLIC_PAGE_SIZE,
    }),
  ]);

  return {
    org,
    filters,
    items: serialize(rows),
    total,
    page: filters.page,
    pageSize: PUBLIC_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE)),
  };
}
export type PublicListingCard = Awaited<ReturnType<typeof listPublicListings>>["items"][number];

/** Cities/localities and property types that actually have public listings (for filter dropdowns). */
export async function getPublicFilterOptions(organizationId: string) {
  const [types, places] = await Promise.all([
    prisma.listing.findMany({
      where: publicListingWhere(organizationId),
      distinct: ["propertyType"],
      select: { propertyType: true },
    }),
    prisma.listing.findMany({
      where: publicListingWhere(organizationId),
      distinct: ["city", "locality"],
      select: { city: true, locality: true },
      take: 200,
    }),
  ]);
  const locations = new Set<string>();
  for (const p of places) {
    if (p.city?.trim()) locations.add(p.city.trim());
    if (p.locality?.trim()) locations.add(p.locality.trim());
  }
  return {
    propertyTypes: types.map((t) => t.propertyType as ListingPropertyType),
    locations: [...locations].sort((a, b) => a.localeCompare(b)),
  };
}

export async function getPublicListing(orgSlug: string, listingSlug: string) {
  const org = await getPublicOrg(orgSlug);
  if (!isValidSlug(listingSlug)) throw new NotFoundError("Listing");
  const listing = await prisma.listing.findFirst({
    where: { ...publicListingWhere(org.id), slug: listingSlug },
    select: detailSelect,
  });
  if (!listing) throw new NotFoundError("Listing");

  const { photos, ...rest } = listing;
  const photoIds = [
    ...(listing.coverFileId ? [listing.coverFileId] : []),
    ...photos.map((p) => p.id).filter((id) => id !== listing.coverFileId),
  ];

  // Prefer similar listings (same purpose), then fill with anything else public.
  const similar = await prisma.listing.findMany({
    where: { ...publicListingWhere(org.id), id: { not: listing.id }, purpose: listing.purpose as ListingPurpose },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: cardSelect,
    take: 3,
  });
  const others =
    similar.length < 3
      ? await prisma.listing.findMany({
          where: {
            ...publicListingWhere(org.id),
            id: { notIn: [listing.id, ...similar.map((s) => s.id)] },
          },
          orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          select: cardSelect,
          take: 3 - similar.length,
        })
      : [];

  return { org, listing: serialize({ ...rest, photoIds }), more: serialize([...similar, ...others]) };
}
export type PublicListingDetail = Awaited<ReturnType<typeof getPublicListing>>["listing"];

export type PublicFile = { key: string; mimeType: string; originalName: string };

/**
 * Authorize a public photo: the file must be the listing's cover or one of its
 * photos, the listing must be public right now, and its org's page enabled.
 */
export async function authorizePublicListingPhoto(listingId: string, fileId: string): Promise<PublicFile> {
  if (!listingId || !fileId || listingId.length > 64 || fileId.length > 64) throw new NotFoundError("File");
  const listing = await prisma.listing.findFirst({
    where: {
      id: listingId,
      isPublished: true,
      status: { in: [...PUBLIC_LISTING_STATUSES] },
      archivedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, dealerEnabled: true, publicListingsEnabled: true },
    },
    select: { id: true, organizationId: true, coverFileId: true },
  });
  if (!listing) throw new NotFoundError("File");
  const file = await prisma.storedFile.findFirst({
    where: {
      id: fileId,
      organizationId: listing.organizationId,
      deletedAt: null,
      mimeType: { startsWith: "image/" },
      OR: [{ listingId: listing.id }, ...(listing.coverFileId === fileId ? [{ id: fileId }] : [])],
    },
    select: { key: true, mimeType: true, originalName: true },
  });
  if (!file) throw new NotFoundError("File");
  return file;
}

/** The organization's logo, only while its public page is enabled. */
export async function authorizePublicOrgLogo(orgSlug: string): Promise<PublicFile> {
  if (!isValidSlug(orgSlug)) throw new NotFoundError("File");
  const org = await prisma.organization.findFirst({
    where: publicOrgWhere(orgSlug),
    select: { id: true, logoFileId: true },
  });
  if (!org?.logoFileId) throw new NotFoundError("File");
  const file = await prisma.storedFile.findFirst({
    where: { id: org.logoFileId, organizationId: org.id, deletedAt: null, mimeType: { startsWith: "image/" } },
    select: { key: true, mimeType: true, originalName: true },
  });
  if (!file) throw new NotFoundError("File");
  return file;
}

/** Every public org page and listing, for /l/sitemap.xml. */
export async function listPublicSitemapEntries(limit = 5000) {
  const orgs = await prisma.organization.findMany({
    where: { status: "ACTIVE", deletedAt: null, dealerEnabled: true, publicListingsEnabled: true },
    select: { id: true, slug: true, updatedAt: true },
    take: 1000,
  });
  if (orgs.length === 0) return [];
  const slugById = new Map(orgs.map((o) => [o.id, o.slug]));
  const listings = await prisma.listing.findMany({
    where: {
      organizationId: { in: orgs.map((o) => o.id) },
      isPublished: true,
      status: { in: [...PUBLIC_LISTING_STATUSES] },
      archivedAt: null,
    },
    select: { organizationId: true, slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return [
    ...orgs.map((o) => ({ path: `/l/${o.slug}`, lastModified: o.updatedAt })),
    ...listings.map((l) => ({ path: `/l/${slugById.get(l.organizationId)}/${l.slug}`, lastModified: l.updatedAt })),
  ];
}
