import { prisma, type DbClient } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { actorOf, can, requireAnyPermission, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import {
  listingCoverSchema,
  listingFiltersSchema,
  listingPhotosSchema,
  listingPublishSchema,
  listingSchema,
  listingStatusSchema,
  listingTransitions,
  PUBLISHABLE_LISTING_STATUSES,
  type ListingCoverInput,
  type ListingFilters,
  type ListingInput,
  type ListingPhotosInput,
  type ListingPublishInput,
  type ListingStatusInput,
} from "@/lib/validation/real-estate";
import { nextCode } from "@/lib/sequence";
import { serialize } from "@/lib/serialize";
import { listingStatusLabels } from "@/config/real-estate-labels";
import { claimUpload } from "@/services/files/file-service";
import {
  assertAgentMember,
  assertDealerEnabled,
  assertManagedUnit,
  assertOwnerInOrg,
  listAgentOptions,
  uniqueListingSlug,
} from "./shared";

const ENTITY = "Listing";
export const MAX_LISTING_PHOTOS = 20;

const listInclude = {
  agent: { select: { id: true, name: true } },
  hostel: { select: { id: true, name: true } },
  room: { select: { id: true, roomNumber: true } },
  _count: { select: { photos: { where: { deletedAt: null } }, leads: { where: { archivedAt: null } } } },
} satisfies Prisma.ListingInclude;

function orgWhere(ctx: TenantContext): Prisma.ListingWhereInput {
  return { organizationId: ctx.organizationId };
}

function buildWhere(ctx: TenantContext, f: ReturnType<typeof listingFiltersSchema.parse>): Prisma.ListingWhereInput {
  return {
    AND: [
      orgWhere(ctx),
      f.status ? { status: f.status } : { status: { not: "ARCHIVED" } },
      f.purpose ? { purpose: f.purpose } : {},
      f.propertyType ? { propertyType: f.propertyType } : {},
      f.city ? { city: { contains: f.city, mode: "insensitive" } } : {},
      f.agentUserId ? { agentUserId: f.agentUserId } : {},
      f.minPrice !== undefined ? { price: { gte: f.minPrice } } : {},
      f.maxPrice !== undefined ? { price: { lte: f.maxPrice } } : {},
      f.q
        ? {
            OR: [
              { title: { contains: f.q, mode: "insensitive" } },
              { code: { contains: f.q, mode: "insensitive" } },
              { locality: { contains: f.q, mode: "insensitive" } },
              { city: { contains: f.q, mode: "insensitive" } },
              { address: { contains: f.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
}

function orderBy(f: { sort?: string; dir?: "asc" | "desc" }): Prisma.ListingOrderByWithRelationInput[] {
  const dir = f.dir ?? "desc";
  switch (f.sort) {
    case "price":
      return [{ price: dir }];
    case "title":
      return [{ title: dir }];
    case "code":
      return [{ code: dir }];
    case "status":
      return [{ status: dir }, { createdAt: "desc" }];
    case "createdAt":
      return [{ createdAt: dir }];
    default:
      return [{ updatedAt: "desc" }];
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listListings(ctx: TenantContext, raw: ListingFilters = {}) {
  requirePermission(ctx, "listings.view");
  assertDealerEnabled(ctx);
  const filters = parseInput(listingFiltersSchema, raw);
  const where = buildWhere(ctx, filters);
  const { skip, take, page, pageSize } = paginate(filters);
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({ where, skip, take, orderBy: orderBy(filters), include: listInclude }),
    prisma.listing.count({ where }),
  ]);
  return serialize(toPaginated(rows, total, page, pageSize));
}

/** Status counts for the listings page header. */
export async function getListingCounts(ctx: TenantContext) {
  requirePermission(ctx, "listings.view");
  assertDealerEnabled(ctx);
  const grouped = await prisma.listing.groupBy({ by: ["status"], where: orgWhere(ctx), _count: { _all: true } });
  const count = (s: ListingStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const published = await prisma.listing.count({ where: { ...orgWhere(ctx), isPublished: true } });
  return {
    active: count("ACTIVE"),
    underOffer: count("UNDER_OFFER"),
    draft: count("DRAFT"),
    closed: count("SOLD") + count("RENTED"),
    published,
  };
}

/** Lightweight listing options for lead / viewing / deal pickers. */
export async function listListingOptions(ctx: TenantContext, options: { includeId?: string | null } = {}) {
  requireAnyPermission(ctx, "listings.view", "leads.manage", "deals.manage");
  assertDealerEnabled(ctx);
  const rows = await prisma.listing.findMany({
    where: {
      organizationId: ctx.organizationId,
      OR: [
        { status: { in: ["DRAFT", "ACTIVE", "UNDER_OFFER"] } },
        ...(options.includeId ? [{ id: options.includeId }] : []),
      ],
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 300,
    select: { id: true, code: true, title: true, purpose: true, status: true, price: true, city: true, locality: true, roomId: true, agentUserId: true },
  });
  return serialize(rows);
}

export async function getListing(ctx: TenantContext, id: string) {
  requirePermission(ctx, "listings.view");
  assertDealerEnabled(ctx);
  const canLeads = can(ctx, "leads.view");
  const canDeals = can(ctx, "deals.view");
  const listing = await prisma.listing.findFirst({
    where: { id, ...orgWhere(ctx) },
    include: {
      ...listInclude,
      hostel: { select: { id: true, name: true, kind: true, rentalMode: true } },
      room: { select: { id: true, roomNumber: true, hostelId: true } },
      owner: { select: { id: true, name: true, phone: true, ownerCode: true } },
      photos: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, originalName: true, mimeType: true, size: true },
      },
      // Related records are only loaded for members who may see them (take: 0 otherwise).
      leads: {
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
        take: canLeads ? 50 : 0,
        select: { id: true, code: true, name: true, phone: true, stage: true, createdAt: true, assignedTo: { select: { id: true, name: true } } },
      },
      viewings: {
        where: { lead: { archivedAt: null } },
        orderBy: { scheduledAt: "desc" },
        take: canLeads ? 50 : 0,
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          feedback: true,
          lead: { select: { id: true, code: true, name: true, phone: true } },
          agent: { select: { id: true, name: true } },
        },
      },
      deals: {
        orderBy: { createdAt: "desc" },
        take: canDeals ? 50 : 0,
        select: { id: true, code: true, clientName: true, stage: true, type: true, agreedAmount: true, createdAt: true },
      },
    },
  });
  if (!listing) throw new NotFoundError("Listing");
  const canManage = can(ctx, "listings.manage");
  const publicUrl =
    listing.isPublished && ctx.organization.publicListingsEnabled ? `/l/${ctx.organization.slug}/${listing.slug}` : null;
  return serialize({
    ...listing,
    publicUrl,
    access: {
      canManage,
      canSeeLeads: canLeads,
      canSeeDeals: canDeals,
      canCreateDeal: can(ctx, "deals.manage"),
      canScheduleViewing: can(ctx, "leads.manage"),
      allowedStatuses: canManage ? listingTransitions(listing.status, listing.purpose) : [],
      canPublish: canManage && PUBLISHABLE_LISTING_STATUSES.includes(listing.status),
      maxPhotos: MAX_LISTING_PHOTOS,
    },
  });
}

/** Properties/units, owners and agents for the listing form. */
export async function getListingFormOptions(ctx: TenantContext) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const [properties, owners, agents] = await Promise.all([
    prisma.hostel.findMany({
      where: {
        organizationId: ctx.organizationId,
        archivedAt: null,
        ...(ctx.allHostels ? {} : { id: { in: ctx.accessibleHostelIds } }),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        rooms: {
          where: { archivedAt: null },
          orderBy: { roomNumber: "asc" },
          take: 500,
          select: { id: true, roomNumber: true },
        },
      },
    }),
    prisma.propertyOwner.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, ownerCode: true },
    }),
    listAgentOptions(ctx),
  ]);
  return {
    properties: properties.map((p) => ({ id: p.id, name: p.name, city: p.city, address: p.address, units: p.rooms })),
    owners,
    agents,
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

async function loadListing(ctx: TenantContext, id: string, db: DbClient = prisma) {
  const listing = await db.listing.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!listing) throw new NotFoundError("Listing");
  return listing;
}

function snapshot(l: {
  title: string;
  purpose: string;
  propertyType: string;
  status: string;
  price: unknown;
  priceNegotiable: boolean;
  city: string | null;
  locality: string | null;
  hostelId: string | null;
  roomId: string | null;
  ownerId: string | null;
  agentUserId: string | null;
  isPublished: boolean;
}) {
  return {
    title: l.title,
    purpose: l.purpose,
    propertyType: l.propertyType,
    status: l.status,
    price: l.price,
    priceNegotiable: l.priceNegotiable,
    city: l.city,
    locality: l.locality,
    hostelId: l.hostelId,
    roomId: l.roomId,
    ownerId: l.ownerId,
    agentUserId: l.agentUserId,
    isPublished: l.isPublished,
  };
}

function fieldData(input: ReturnType<typeof listingSchema.parse>) {
  return {
    title: input.title,
    purpose: input.purpose,
    propertyType: input.propertyType,
    price: input.price,
    priceNegotiable: input.priceNegotiable,
    areaValue: input.areaValue ?? null,
    areaUnit: input.areaValue != null ? (input.areaUnit ?? null) : null,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    furnished: input.furnished,
    address: input.address ?? null,
    locality: input.locality ?? null,
    city: input.city ?? null,
    description: input.description ?? null,
    features: input.features,
    hostelId: input.hostelId ?? null,
    roomId: input.roomId ?? null,
    ownerId: input.ownerId ?? null,
    agentUserId: input.agentUserId ?? null,
  };
}

export async function createListing(ctx: TenantContext, raw: ListingInput) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(listingSchema, raw);
  if (input.hostelId) await assertManagedUnit(ctx, input.hostelId, input.roomId);
  if (input.ownerId) await assertOwnerInOrg(ctx, input.ownerId);
  if (input.agentUserId) await assertAgentMember(ctx, input.agentUserId);

  const listing = await prisma.$transaction(async (tx) => {
    const code = await nextCode(tx, ctx.organizationId, "listing", "LST", 5);
    const slug = await uniqueListingSlug(tx, ctx.organizationId, input.title);
    const created = await tx.listing.create({
      data: { ...fieldData(input), organizationId: ctx.organizationId, code, slug, status: "DRAFT" },
    });
    await audit(actorOf(ctx), { action: "listing.created", entityType: ENTITY, entityId: created.id, after: { code, slug, ...snapshot(created) } }, tx);
    return created;
  });
  return serialize(listing);
}

export async function updateListing(ctx: TenantContext, id: string, raw: ListingInput) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(listingSchema, raw);
  const before = await loadListing(ctx, id);
  if (before.status === "ARCHIVED") throw new BusinessRuleError("Restore this listing before editing it.");

  const linkChanged = (input.hostelId ?? null) !== before.hostelId || (input.roomId ?? null) !== before.roomId;
  if (linkChanged && input.hostelId) await assertManagedUnit(ctx, input.hostelId, input.roomId);
  if (input.ownerId && input.ownerId !== before.ownerId) await assertOwnerInOrg(ctx, input.ownerId);
  if (input.agentUserId && input.agentUserId !== before.agentUserId) await assertAgentMember(ctx, input.agentUserId);
  if (before.status === "SOLD" && input.purpose !== before.purpose) {
    throw new BusinessRuleError("A sold listing's purpose can't be changed.");
  }
  if (before.status === "RENTED" && input.purpose !== before.purpose) {
    throw new BusinessRuleError("A rented listing's purpose can't be changed.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // The slug stays stable so public links keep working after a title edit.
    const row = await tx.listing.update({ where: { id }, data: fieldData(input) });
    await audit(actorOf(ctx), { action: "listing.updated", entityType: ENTITY, entityId: id, before: snapshot(before), after: snapshot(row) }, tx);
    return row;
  });
  return serialize(updated);
}

/** Apply a status change inside an existing transaction (used by deals too). */
export async function applyListingStatus(
  tx: DbClient,
  ctx: TenantContext,
  listing: { id: string; status: ListingStatus; isPublished: boolean; archivedAt: Date | null },
  status: ListingStatus,
  metadata?: Record<string, unknown>,
) {
  const publishable = PUBLISHABLE_LISTING_STATUSES.includes(status);
  const row = await tx.listing.update({
    where: { id: listing.id },
    data: {
      status,
      archivedAt: status === "ARCHIVED" ? (listing.archivedAt ?? new Date()) : null,
      ...(publishable ? {} : { isPublished: false }),
    },
  });
  await audit(
    actorOf(ctx),
    {
      action: "listing.status_changed",
      entityType: ENTITY,
      entityId: listing.id,
      before: { status: listing.status, isPublished: listing.isPublished },
      after: { status: row.status, isPublished: row.isPublished },
      metadata,
    },
    tx,
  );
  return row;
}

export async function changeListingStatus(ctx: TenantContext, id: string, raw: ListingStatusInput) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(listingStatusSchema, raw);
  const before = await loadListing(ctx, id);
  if (input.status === before.status) return serialize(before);
  if (!listingTransitions(before.status, before.purpose).includes(input.status)) {
    throw new BusinessRuleError(
      `A ${listingStatusLabels[before.status].toLowerCase()} listing can't be marked as ${listingStatusLabels[input.status].toLowerCase()}.`,
    );
  }
  const updated = await prisma.$transaction((tx) => applyListingStatus(tx, ctx, before, input.status));
  return serialize(updated);
}

export async function archiveListing(ctx: TenantContext, id: string) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const before = await loadListing(ctx, id);
  if (before.status === "ARCHIVED") return;
  await prisma.$transaction((tx) => applyListingStatus(tx, ctx, before, "ARCHIVED"));
}

export async function setListingPublished(ctx: TenantContext, id: string, raw: ListingPublishInput) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(listingPublishSchema, raw);
  const before = await loadListing(ctx, id);
  if (input.published === before.isPublished) return serialize(before);
  if (input.published && !PUBLISHABLE_LISTING_STATUSES.includes(before.status)) {
    throw new BusinessRuleError("Only active or under-offer listings can be published. Activate the listing first.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.listing.update({
      where: { id },
      data: input.published ? { isPublished: true, publishedAt: new Date() } : { isPublished: false },
    });
    await audit(
      actorOf(ctx),
      {
        action: input.published ? "listing.published" : "listing.unpublished",
        entityType: ENTITY,
        entityId: id,
        before: { isPublished: before.isPublished },
        after: { isPublished: row.isPublished },
      },
      tx,
    );
    return row;
  });
  return serialize(updated);
}

export async function addListingPhotos(ctx: TenantContext, id: string, raw: ListingPhotosInput) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(listingPhotosSchema, raw);
  const listing = await loadListing(ctx, id);
  if (listing.status === "ARCHIVED") throw new BusinessRuleError("Restore this listing before adding photos.");
  const ids = input.photoFileIds;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.storedFile.count({ where: { listingId: id, deletedAt: null } });
    if (existing + ids.length > MAX_LISTING_PHOTOS) {
      throw new BusinessRuleError(`A listing can have at most ${MAX_LISTING_PHOTOS} photos (${existing} already added).`);
    }
    for (const fileId of ids) {
      await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, fileId, ["listing-photo"]);
    }
    await tx.storedFile.updateMany({ where: { id: { in: ids }, organizationId: ctx.organizationId }, data: { listingId: id } });
    if (!listing.coverFileId) await tx.listing.update({ where: { id }, data: { coverFileId: ids[0] } });
    await audit(actorOf(ctx), { action: "listing.photos_added", entityType: ENTITY, entityId: id, metadata: { count: ids.length } }, tx);
  });
  return { added: ids.length };
}

export async function setListingCover(ctx: TenantContext, id: string, raw: ListingCoverInput) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(listingCoverSchema, raw);
  const listing = await loadListing(ctx, id);
  const photo = await prisma.storedFile.findFirst({
    where: { id: input.fileId, organizationId: ctx.organizationId, listingId: id, deletedAt: null },
    select: { id: true },
  });
  if (!photo) throw new ValidationError("Choose one of this listing's photos as the cover.");
  if (listing.coverFileId === photo.id) return;
  await prisma.$transaction(async (tx) => {
    await tx.listing.update({ where: { id }, data: { coverFileId: photo.id } });
    await audit(actorOf(ctx), { action: "listing.cover_changed", entityType: ENTITY, entityId: id, before: { coverFileId: listing.coverFileId }, after: { coverFileId: photo.id } }, tx);
  });
}

export async function removeListingPhoto(ctx: TenantContext, id: string, fileId: string) {
  requirePermission(ctx, "listings.manage");
  assertDealerEnabled(ctx);
  const listing = await loadListing(ctx, id);
  const file = await prisma.storedFile.findFirst({
    where: { id: fileId, organizationId: ctx.organizationId, listingId: id, deletedAt: null },
    select: { id: true, originalName: true },
  });
  if (!file) throw new NotFoundError("Photo");
  await prisma.$transaction(async (tx) => {
    await tx.storedFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
    if (listing.coverFileId === file.id) {
      const next = await tx.storedFile.findFirst({
        where: { listingId: id, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      await tx.listing.update({ where: { id }, data: { coverFileId: next?.id ?? null } });
    }
    await audit(actorOf(ctx), { action: "listing.photo_removed", entityType: ENTITY, entityId: id, metadata: { fileId: file.id, name: file.originalName } }, tx);
  });
}
