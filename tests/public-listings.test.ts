import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { ListingStatus } from "@/generated/prisma/enums";
import { NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";
import {
  authorizePublicListingPhoto,
  authorizePublicOrgLogo,
  getPublicListing,
  getPublicOrg,
  listPublicListings,
} from "@/services/public/listings-service";
import { PUBLIC_INQUIRY_LIMIT, submitPublicInquiry } from "@/services/public/inquiry-service";
import { createTenant, prisma } from "./helpers";

const uid = () => randomUUID().slice(0, 8);

async function publicTenant(options: { dealer?: boolean; page?: boolean } = {}) {
  const t = await createTenant();
  const org = await prisma.organization.update({
    where: { id: t.org.id },
    data: { dealerEnabled: options.dealer ?? true, publicListingsEnabled: options.page ?? true, brandName: "Acme Realty" },
  });
  return { ...t, org };
}

let seq = 0;
async function createListing(
  organizationId: string,
  data: Partial<{
    status: ListingStatus;
    isPublished: boolean;
    archivedAt: Date | null;
    purpose: "SALE" | "RENT";
    price: number;
    bedrooms: number;
    city: string;
    locality: string;
  }> = {},
) {
  seq += 1;
  const slug = `listing-${uid()}`;
  return prisma.listing.create({
    data: {
      organizationId,
      code: `LST-${uid()}`,
      slug,
      title: `Listing ${seq}`,
      purpose: data.purpose ?? "SALE",
      propertyType: "HOUSE",
      status: data.status ?? "ACTIVE",
      isPublished: data.isPublished ?? true,
      publishedAt: new Date(),
      archivedAt: data.archivedAt ?? null,
      price: data.price ?? 1_000_000,
      bedrooms: data.bedrooms ?? 3,
      city: data.city ?? "Lahore",
      locality: data.locality ?? "DHA",
      description: "Internal-free public description",
    },
  });
}

async function createFile(organizationId: string, listingId: string | null, mimeType = "image/jpeg") {
  return prisma.storedFile.create({
    data: {
      organizationId,
      key: `test/${uid()}-${uid()}.jpg`,
      originalName: "photo.jpg",
      mimeType,
      size: 10,
      purpose: "listing-photo",
      listingId,
    },
  });
}

function inquiry(orgSlug: string, listingSlug: string, overrides: Record<string, unknown> = {}) {
  return {
    orgSlug,
    listingSlug,
    name: "Sara Buyer",
    phone: "+92 300 1112233",
    email: "sara@example.com",
    message: "Is it available?",
    preferredContact: "WHATSAPP" as const,
    website: "",
    startedAt: Date.now() - 10_000,
    ...overrides,
  };
}

const ip = () => `198.51.100.${uid()}`;

describe("public listings", () => {
  let tenant: Awaited<ReturnType<typeof publicTenant>>;
  let visible: { active: string; underOffer: string };

  beforeAll(async () => {
    tenant = await publicTenant();
    const orgId = tenant.org.id;
    const active = await createListing(orgId, { status: "ACTIVE", price: 500_000 });
    const underOffer = await createListing(orgId, { status: "UNDER_OFFER", price: 900_000, purpose: "RENT" });
    await createListing(orgId, { status: "DRAFT" });
    await createListing(orgId, { status: "SOLD" });
    await createListing(orgId, { status: "RENTED" });
    await createListing(orgId, { status: "ACTIVE", isPublished: false });
    await createListing(orgId, { status: "ACTIVE", archivedAt: new Date() });
    visible = { active: active.id, underOffer: underOffer.id };
  });

  it("returns only published ACTIVE / UNDER_OFFER listings", async () => {
    const result = await listPublicListings(tenant.org.slug);
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.id).sort()).toEqual([visible.active, visible.underOffer].sort());
    // Only allow-listed fields leave the service.
    const keys = Object.keys(result.items[0]!);
    for (const secret of ["ownerId", "agentUserId", "code", "hostelId", "roomId", "organizationId"]) {
      expect(keys).not.toContain(secret);
    }
    expect(result.org.displayName).toBe("Acme Realty");
  });

  it("applies filters, sort and ignores junk query values", async () => {
    const rent = await listPublicListings(tenant.org.slug, { purpose: "RENT" });
    expect(rent.items.map((i) => i.id)).toEqual([visible.underOffer]);
    const cheap = await listPublicListings(tenant.org.slug, { maxPrice: "600000" });
    expect(cheap.items.map((i) => i.id)).toEqual([visible.active]);
    const sorted = await listPublicListings(tenant.org.slug, { sort: "price_desc" });
    expect(sorted.items.map((i) => i.id)).toEqual([visible.underOffer, visible.active]);
    const junk = await listPublicListings(tenant.org.slug, { purpose: "EVIL", minPrice: "abc", maxPrice: "", page: "-3" });
    expect(junk.total).toBe(2);
    expect(junk.page).toBe(1);
    const place = await listPublicListings(tenant.org.slug, { location: "dha" });
    expect(place.total).toBe(2);
  });

  it("hides non-public listings on the detail page", async () => {
    const draft = await createListing(tenant.org.id, { status: "DRAFT" });
    await expect(getPublicListing(tenant.org.slug, draft.slug)).rejects.toBeInstanceOf(NotFoundError);
    const active = await prisma.listing.findUniqueOrThrow({ where: { id: visible.active } });
    const detail = await getPublicListing(tenant.org.slug, active.slug);
    expect(detail.listing.id).toBe(active.id);
    expect(detail.more.map((m) => m.id)).not.toContain(active.id);
    expect(detail.more.every((m) => [visible.active, visible.underOffer].includes(m.id))).toBe(true);
  });

  it("treats disabled, suspended and unknown orgs as not found", async () => {
    const noPage = await publicTenant({ page: false });
    const noDealer = await publicTenant({ dealer: false });
    const suspended = await publicTenant();
    await prisma.organization.update({ where: { id: suspended.org.id }, data: { status: "SUSPENDED" } });
    for (const slug of [noPage.org.slug, noDealer.org.slug, suspended.org.slug, "does-not-exist", "../etc"]) {
      await expect(getPublicOrg(slug)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listPublicListings(slug)).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it("authorizes photos only for the listing they belong to", async () => {
    const orgId = tenant.org.id;
    const photo = await createFile(orgId, visible.active);
    const cover = await createFile(orgId, null);
    await prisma.listing.update({ where: { id: visible.active }, data: { coverFileId: cover.id } });

    await expect(authorizePublicListingPhoto(visible.active, photo.id)).resolves.toMatchObject({ key: photo.key });
    await expect(authorizePublicListingPhoto(visible.active, cover.id)).resolves.toMatchObject({ key: cover.key });

    // A file attached to another listing of the same org.
    const otherPhoto = await createFile(orgId, visible.underOffer);
    await expect(authorizePublicListingPhoto(visible.active, otherPhoto.id)).rejects.toBeInstanceOf(NotFoundError);

    // A file from another organization.
    const other = await publicTenant();
    const foreign = await createFile(other.org.id, null);
    await expect(authorizePublicListingPhoto(visible.active, foreign.id)).rejects.toBeInstanceOf(NotFoundError);

    // Non-image files (e.g. a resident document) never go out, even if linked.
    const pdf = await createFile(orgId, visible.active, "application/pdf");
    await expect(authorizePublicListingPhoto(visible.active, pdf.id)).rejects.toBeInstanceOf(NotFoundError);

    // A photo of a non-public listing.
    const draft = await createListing(orgId, { status: "DRAFT" });
    const draftPhoto = await createFile(orgId, draft.id);
    await expect(authorizePublicListingPhoto(draft.id, draftPhoto.id)).rejects.toBeInstanceOf(NotFoundError);

    // The whole page switched off.
    const off = await publicTenant();
    const offListing = await createListing(off.org.id);
    const offPhoto = await createFile(off.org.id, offListing.id);
    await expect(authorizePublicListingPhoto(offListing.id, offPhoto.id)).resolves.toBeTruthy();
    await prisma.organization.update({ where: { id: off.org.id }, data: { publicListingsEnabled: false } });
    await expect(authorizePublicListingPhoto(offListing.id, offPhoto.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("serves the logo only while the page is enabled", async () => {
    const t = await publicTenant();
    const logo = await createFile(t.org.id, null, "image/png");
    await prisma.organization.update({ where: { id: t.org.id }, data: { logoFileId: logo.id } });
    await expect(authorizePublicOrgLogo(t.org.slug)).resolves.toMatchObject({ key: logo.key });
    await prisma.organization.update({ where: { id: t.org.id }, data: { dealerEnabled: false } });
    await expect(authorizePublicOrgLogo(t.org.slug)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("public inquiries", () => {
  it("creates one lead and dedupes repeat inquiries by phone", async () => {
    const t = await publicTenant();
    const listing = await createListing(t.org.id, { purpose: "RENT" });
    const addr = ip();

    await expect(submitPublicInquiry(inquiry(t.org.slug, listing.slug), { ipAddress: addr })).resolves.toBe("created");
    // Same number, different formatting → joins the open lead.
    await expect(
      submitPublicInquiry(inquiry(t.org.slug, listing.slug, { phone: "+923001112233", name: "Sara B" }), { ipAddress: addr }),
    ).resolves.toBe("appended");

    const leads = await prisma.lead.findMany({ where: { organizationId: t.org.id }, include: { activities: true } });
    expect(leads).toHaveLength(1);
    const lead = leads[0]!;
    expect(lead).toMatchObject({
      source: "WEBSITE",
      stage: "NEW",
      interest: "RENT",
      listingId: listing.id,
      name: "Sara Buyer",
      phone: "+923001112233",
    });
    expect(lead.code).toMatch(/^LEAD-\d{5}$/);
    expect(lead.activities).toHaveLength(2);
    expect(lead.activities.every((a) => a.type === "NOTE" && a.body.startsWith("Inquiry from public page"))).toBe(true);

    const audits = await prisma.auditLog.findMany({ where: { organizationId: t.org.id, entityId: lead.id } });
    expect(audits.map((a) => a.action)).toContain("lead.created_public");
    expect(audits.every((a) => a.userId === null)).toBe(true);

    const notes = await prisma.notification.findMany({ where: { organizationId: t.org.id, type: "LEAD_RECEIVED" } });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]!.link).toBe(`/leads/${lead.id}`);

    // A closed lead does not absorb new inquiries.
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: "LOST" } });
    await expect(submitPublicInquiry(inquiry(t.org.slug, listing.slug), { ipAddress: addr })).resolves.toBe("created");
    expect(await prisma.lead.count({ where: { organizationId: t.org.id } })).toBe(2);
  });

  it("drops honeypot submissions and rejects instant ones", async () => {
    const t = await publicTenant();
    const listing = await createListing(t.org.id);
    await expect(
      submitPublicInquiry(inquiry(t.org.slug, listing.slug, { website: "http://spam" }), { ipAddress: ip() }),
    ).resolves.toBe("dropped");
    const now = Date.now();
    await expect(
      submitPublicInquiry(inquiry(t.org.slug, listing.slug, { startedAt: now - 200 }), { ipAddress: ip(), now }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.lead.count({ where: { organizationId: t.org.id } })).toBe(0);
  });

  it("validates input and refuses non-public listings", async () => {
    const t = await publicTenant();
    const listing = await createListing(t.org.id);
    const draft = await createListing(t.org.id, { status: "DRAFT" });
    await expect(
      submitPublicInquiry(inquiry(t.org.slug, listing.slug, { phone: "" }), { ipAddress: ip() }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      submitPublicInquiry(inquiry(t.org.slug, listing.slug, { preferredContact: "EMAIL", email: "" }), { ipAddress: ip() }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(submitPublicInquiry(inquiry(t.org.slug, draft.slug), { ipAddress: ip() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await prisma.lead.count({ where: { organizationId: t.org.id } })).toBe(0);
  });

  it("rate limits per IP per organization", async () => {
    const t = await publicTenant();
    const listing = await createListing(t.org.id);
    const addr = ip();
    for (let i = 0; i < PUBLIC_INQUIRY_LIMIT.limit; i++) {
      await submitPublicInquiry(inquiry(t.org.slug, listing.slug, { phone: `+92300${String(i).padStart(7, "0")}` }), {
        ipAddress: addr,
      });
    }
    await expect(
      submitPublicInquiry(inquiry(t.org.slug, listing.slug, { phone: "+923009999999" }), { ipAddress: addr }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(await prisma.lead.count({ where: { organizationId: t.org.id } })).toBe(PUBLIC_INQUIRY_LIMIT.limit);
    // Another visitor is unaffected.
    await expect(
      submitPublicInquiry(inquiry(t.org.slug, listing.slug, { phone: "+923008888888" }), { ipAddress: ip() }),
    ).resolves.toBe("created");
  });
});
