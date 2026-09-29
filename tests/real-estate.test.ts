import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import { computeCommission, zonedTimeToUtc } from "@/lib/validation/real-estate";
import {
  addListingPhotos,
  changeListingStatus,
  createListing,
  getListing,
  listListings,
  removeListingPhoto,
  setListingPublished,
  updateListing,
} from "@/services/real-estate/listing-service";
import { addLeadActivity, changeLeadStage, createLead, findDuplicateLeads, getLead, listLeads } from "@/services/real-estate/lead-service";
import { recordViewingOutcome, scheduleViewing } from "@/services/real-estate/viewing-service";
import { changeDealStage, createDeal, getDeal, getDealSummary, listDeals, setDealCommissionPaid } from "@/services/real-estate/deal-service";
import { getSalesSummary } from "@/services/real-estate/summary";
import { slugify } from "@/services/real-estate/shared";
import { addMember, createHostelWithRoom, createTenant, prisma, reload } from "./helpers";

async function dealerTenant(name: string) {
  const t = await createTenant(name);
  await prisma.organization.update({ where: { id: t.org.id }, data: { dealerEnabled: true, publicListingsEnabled: true } });
  return { ...t, ctx: await reload(t.ctx) };
}

const baseListing = {
  title: "5 Marla House in DHA Phase 6",
  purpose: "SALE" as const,
  propertyType: "HOUSE" as const,
  price: 25_000_000,
  areaValue: 5,
  areaUnit: "MARLA" as const,
  city: "Lahore",
  features: ["Corner", "Parking", "corner"],
};

function tomorrow() {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

describe("real estate: module guard, isolation and permissions", () => {
  let a: TenantContext;
  let b: TenantContext;
  let listingB: { id: string };
  let leadB: { id: string };
  let dealB: { id: string };
  let hostelB: string;
  let ownerB: string;

  beforeAll(async () => {
    a = (await dealerTenant("RE Org A")).ctx;
    const tb = await dealerTenant("RE Org B");
    const structure = await createHostelWithRoom(tb.ctx, 1);
    b = structure.ctx;
    hostelB = structure.hostel.id;
    ownerB = (
      await prisma.propertyOwner.create({ data: { organizationId: b.organizationId, ownerCode: `OWN-${randomUUID().slice(0, 6)}`, name: "Owner B" } })
    ).id;
    listingB = await createListing(b, baseListing);
    leadB = await createLead(b, { name: "Lead B", phone: "03001112222" });
    dealB = await createDeal(b, { type: "SALE", clientName: "Client B", agreedAmount: 1_000_000, commissionPercent: 1 });
  });

  it("refuses every call while the module is disabled", async () => {
    const off = (await createTenant("RE Disabled")).ctx;
    await expect(listListings(off)).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(createLead(off, { name: "X", phone: "03000000000" })).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(listDeals(off)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(await getSalesSummary(off)).toBeNull();
  });

  it("hides other tenants' listings, leads and deals", async () => {
    await expect(getListing(a, listingB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getLead(a, leadB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDeal(a, dealB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(changeListingStatus(a, listingB.id, { status: "ACTIVE" })).rejects.toBeInstanceOf(NotFoundError);
    const list = await listListings(a);
    expect(list.items.some((l) => l.id === listingB.id)).toBe(false);
  });

  it("can't link another tenant's property, unit or owner", async () => {
    await expect(createListing(a, { ...baseListing, hostelId: hostelB })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createListing(a, { ...baseListing, ownerId: ownerB })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createLead(a, { name: "Cross", phone: "03001230000", listingId: listingB.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createDeal(a, { type: "SALE", clientName: "Cross", agreedAmount: 10, listingId: listingB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(scheduleViewing(a, { leadId: leadB.id, listingId: listingB.id, date: tomorrow(), time: "15:00" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("links a managed unit of the same organization", async () => {
    const s = await createHostelWithRoom(a, 1);
    a = s.ctx;
    const other = await createHostelWithRoom(a, 1);
    a = other.ctx;
    const listing = await createListing(a, { ...baseListing, purpose: "RENT", hostelId: s.hostel.id, roomId: s.room.id });
    expect(listing.roomId).toBe(s.room.id);
    // A unit that belongs to a different property is rejected.
    await expect(createListing(a, { ...baseListing, hostelId: s.hostel.id, roomId: other.room.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("AGENT manages leads but not deals; ACCOUNTANT only views deals", async () => {
    const agent = await addMember(a, "AGENT");
    const accountant = await addMember(a, "ACCOUNTANT");
    const lead = await createLead(agent, { name: "Agent lead", email: "buyer@example.com" });
    expect(lead.code).toMatch(/^LEAD-\d{5}$/);
    await expect(createDeal(agent, { type: "SALE", clientName: "No", agreedAmount: 100 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listDeals(agent)).resolves.toBeTruthy();

    await expect(listDeals(accountant)).resolves.toBeTruthy();
    await expect(createDeal(accountant, { type: "SALE", clientName: "No", agreedAmount: 100 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listLeads(accountant)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createListing(accountant, baseListing)).rejects.toBeInstanceOf(ForbiddenError);
    const summary = await getSalesSummary(accountant);
    expect(summary?.activeListings).toBeNull();
    expect(summary?.openDealsValue).not.toBeNull();
  });

  it("hides leads and deals on a listing from members who can only view listings", async () => {
    const listing = await createListing(a, baseListing);
    await createLead(a, { name: "Hidden lead", phone: "03007778888", listingId: listing.id });
    const role = await prisma.role.create({
      data: { organizationId: a.organizationId, key: `VIEWER_${randomUUID().slice(0, 6)}`, name: "Listing viewer", permissions: { create: [{ permission: "listings.view" }] } },
    });
    const user = await prisma.user.create({ data: { name: "Viewer", email: `${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
    await prisma.organizationMember.create({ data: { organizationId: a.organizationId, userId: user.id, roleId: role.id, allHostels: true } });
    const viewer = await reload({ ...a, userId: user.id });
    const detail = await getListing(viewer, listing.id);
    expect(detail.leads).toHaveLength(0);
    expect(detail.deals).toHaveLength(0);
    expect(detail.access.canManage).toBe(false);
    expect((await getListing(a, listing.id)).leads).toHaveLength(1);
  });
});

describe("real estate: listings", () => {
  let ctx: TenantContext;
  beforeAll(async () => {
    ctx = (await dealerTenant("RE Listings")).ctx;
  });

  it("generates codes and unique slugs per organization", async () => {
    const first = await createListing(ctx, baseListing);
    const second = await createListing(ctx, baseListing);
    expect(first.code).toMatch(/^LST-\d{5}$/);
    expect(first.slug).toBe(slugify(baseListing.title));
    expect(first.slug).toBe("5-marla-house-in-dha-phase-6");
    expect(second.slug).not.toBe(first.slug);
    expect(second.slug.startsWith(`${first.slug}-`)).toBe(true);
    expect(first.features).toEqual(["Corner", "Parking"]);
  });

  it("keeps the slug stable when the title changes", async () => {
    const listing = await createListing(ctx, { ...baseListing, title: "Stable slug plot" });
    const updated = await updateListing(ctx, listing.id, { ...baseListing, title: "Renamed plot" });
    expect(updated.slug).toBe(listing.slug);
  });

  it("only publishes active listings and unpublishes when closed", async () => {
    const listing = await createListing(ctx, baseListing);
    await expect(setListingPublished(ctx, listing.id, { published: true })).rejects.toBeInstanceOf(BusinessRuleError);
    await changeListingStatus(ctx, listing.id, { status: "ACTIVE" });
    const published = await setListingPublished(ctx, listing.id, { published: true });
    expect(published.isPublished).toBe(true);
    expect(published.publishedAt).toBeTruthy();
    // A sale listing can't be marked rented.
    await expect(changeListingStatus(ctx, listing.id, { status: "RENTED" })).rejects.toBeInstanceOf(BusinessRuleError);
    const sold = await changeListingStatus(ctx, listing.id, { status: "SOLD" });
    expect(sold.isPublished).toBe(false);
    const detail = await getListing(ctx, listing.id);
    expect(detail.publicUrl).toBeNull();
  });

  it("attaches photos, sets a cover and moves the cover when removed", async () => {
    const listing = await createListing(ctx, baseListing);
    const files = await Promise.all(
      [1, 2].map((i) =>
        prisma.storedFile.create({
          data: {
            organizationId: ctx.organizationId,
            key: `${ctx.organizationId}/listing-photo/test/${randomUUID()}.jpg`,
            originalName: `photo-${i}.jpg`,
            mimeType: "image/jpeg",
            size: 100,
            purpose: "listing-photo",
            uploadedById: ctx.userId,
          },
        }),
      ),
    );
    await addListingPhotos(ctx, listing.id, { photoFileIds: files.map((f) => f.id) });
    let detail = await getListing(ctx, listing.id);
    expect(detail.photos).toHaveLength(2);
    expect(detail.coverFileId).toBe(files[0]!.id);
    // Already attached files can't be claimed again.
    const other = await createListing(ctx, baseListing);
    await expect(addListingPhotos(ctx, other.id, { photoFileIds: [files[1]!.id] })).rejects.toBeInstanceOf(ValidationError);
    await removeListingPhoto(ctx, listing.id, files[0]!.id);
    detail = await getListing(ctx, listing.id);
    expect(detail.photos).toHaveLength(1);
    expect(detail.coverFileId).toBe(files[1]!.id);
  });
});

describe("real estate: leads, viewings and deals", () => {
  let ctx: TenantContext;
  let agent: TenantContext;
  beforeAll(async () => {
    ctx = (await dealerTenant("RE Pipeline")).ctx;
    agent = await addMember(ctx, "AGENT");
  });

  it("requires a reason to mark a lead lost and logs stage changes", async () => {
    const lead = await createLead(ctx, { name: "Lost lead", phone: "0300 555 1234" });
    await expect(changeLeadStage(ctx, lead.id, { stage: "LOST" })).rejects.toBeInstanceOf(ValidationError);
    const lost = await changeLeadStage(ctx, lead.id, { stage: "LOST", lostReason: "Bought elsewhere" });
    expect(lost.stage).toBe("LOST");
    expect(lost.lostReason).toBe("Bought elsewhere");
    const reopened = await changeLeadStage(ctx, lead.id, { stage: "CONTACTED" });
    expect(reopened.lostReason).toBeNull();
    const activities = await prisma.leadActivity.findMany({ where: { leadId: lead.id, type: "STAGE_CHANGE" } });
    expect(activities).toHaveLength(2);
  });

  it("logging a call moves a new lead to contacted", async () => {
    const lead = await createLead(ctx, { name: "Caller", phone: "03215550000" });
    await addLeadActivity(ctx, lead.id, { type: "CALL", body: "Discussed budget" });
    const fresh = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(fresh.stage).toBe("CONTACTED");
    expect(fresh.lastContactedAt).toBeTruthy();
  });

  it("flags duplicate open leads by phone digits or email", async () => {
    const lead = await createLead(ctx, { name: "Dup", phone: "+92 333 7654321", email: "dup@example.com" });
    const byPhone = await findDuplicateLeads(ctx, { phone: "0333-7654321" });
    expect(byPhone.map((d) => d.id)).toContain(lead.id);
    const byEmail = await findDuplicateLeads(ctx, { email: "DUP@example.com" });
    expect(byEmail.map((d) => d.id)).toContain(lead.id);
    expect(await findDuplicateLeads(ctx, { phone: "0333-7654321", excludeId: lead.id })).toHaveLength(0);
  });

  it("scheduling a viewing moves the lead to VIEWING and notifies the agent", async () => {
    const listing = await createListing(ctx, baseListing);
    await changeListingStatus(ctx, listing.id, { status: "ACTIVE" });
    const lead = await createLead(ctx, { name: "Viewer", phone: "03004443333" });
    const viewing = await scheduleViewing(ctx, { leadId: lead.id, listingId: listing.id, agentUserId: agent.userId, date: tomorrow(), time: "16:30" });
    expect(viewing.scheduledAt.toISOString()).toBe(zonedTimeToUtc(tomorrow(), "16:30", ctx.organization.timezone).toISOString());
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("VIEWING");
    expect(await prisma.notification.count({ where: { userId: agent.userId, type: "VIEWING_SCHEDULED" } })).toBe(1);
    await expect(recordViewingOutcome(ctx, viewing.id, { status: "COMPLETED" })).rejects.toBeInstanceOf(BusinessRuleError);
    const cancelled = await recordViewingOutcome(ctx, viewing.id, { status: "CANCELLED", feedback: "Client travelling" });
    expect(cancelled.status).toBe("CANCELLED");
    await expect(scheduleViewing(ctx, { leadId: lead.id, listingId: listing.id, date: "2020-01-01", time: "10:00" })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("computes commission by default and keeps an explicit override", async () => {
    expect(computeCommission(12_500_000, 2)).toBe(250_000);
    expect(computeCommission(1_234_567.89, 2.5)).toBe(30_864.2);
    const auto = await createDeal(ctx, { type: "SALE", clientName: "Auto", agreedAmount: 12_500_000, commissionPercent: 2 });
    expect(auto.commissionAmount).toBe(250_000);
    expect(auto.code).toMatch(/^DEAL-\d{5}$/);
    const manual = await createDeal(ctx, { type: "SALE", clientName: "Manual", agreedAmount: 12_500_000, commissionPercent: 2, commissionAmount: 200_000 });
    expect(manual.commissionAmount).toBe(200_000);
  });

  it("closing a deal won marks the lead won, the listing sold and unpublishes it", async () => {
    const listing = await createListing(ctx, baseListing);
    await changeListingStatus(ctx, listing.id, { status: "ACTIVE" });
    await setListingPublished(ctx, listing.id, { published: true });
    const lead = await createLead(ctx, { name: "Buyer", phone: "03009998888", listingId: listing.id });

    // Type must match the listing's purpose.
    await expect(createDeal(ctx, { type: "RENT", clientName: "Buyer", agreedAmount: 24_000_000, listingId: listing.id, leadId: lead.id })).rejects.toBeInstanceOf(ValidationError);
    const deal = await createDeal(ctx, { type: "SALE", clientName: "Buyer", agreedAmount: 24_000_000, commissionPercent: 1, listingId: listing.id, leadId: lead.id });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("NEGOTIATION");

    await changeDealStage(ctx, deal.id, { stage: "AGREEMENT" });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("UNDER_OFFER");

    await expect(setDealCommissionPaid(ctx, deal.id, { paid: true })).rejects.toBeInstanceOf(BusinessRuleError);
    const won = await changeDealStage(ctx, deal.id, { stage: "CLOSED_WON" });
    expect(won.closedAt).toBeTruthy();
    const [freshLead, freshListing] = await Promise.all([
      prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }),
      prisma.listing.findUniqueOrThrow({ where: { id: listing.id } }),
    ]);
    expect(freshLead.stage).toBe("WON");
    expect(freshListing.status).toBe("SOLD");
    expect(freshListing.isPublished).toBe(false);

    const logs = await prisma.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityId: { in: [deal.id, listing.id] }, action: { in: ["deal.stage_changed", "listing.status_changed"] } } });
    const dealLog = logs.find((l) => l.action === "deal.stage_changed" && (l.metadata as { after?: { stage?: string } }).after?.stage === "CLOSED_WON");
    expect((dealLog?.metadata as { before?: { stage?: string } }).before?.stage).toBe("AGREEMENT");
    expect(logs.some((l) => l.action === "listing.status_changed" && (l.metadata as { after?: { status?: string } }).after?.status === "SOLD")).toBe(true);

    // Won deals are final, and a sold listing can't be won again.
    await expect(changeDealStage(ctx, deal.id, { stage: "OPEN" })).rejects.toBeInstanceOf(BusinessRuleError);
    const paid = await setDealCommissionPaid(ctx, deal.id, { paid: true, paidOn: "2026-09-15" });
    expect(paid.commissionPaidAt?.toISOString().slice(0, 10)).toBe("2026-09-15");

    const summary = await getDealSummary(ctx);
    expect(summary.commissionEarned).toBeGreaterThanOrEqual(240_000);
  });

  it("closing a rent deal marks the listing rented", async () => {
    const listing = await createListing(ctx, { ...baseListing, purpose: "RENT", price: 80_000 });
    await changeListingStatus(ctx, listing.id, { status: "ACTIVE" });
    const deal = await createDeal(ctx, { type: "RENT", clientName: "Tenant", agreedAmount: 75_000, listingId: listing.id });
    await changeDealStage(ctx, deal.id, { stage: "CLOSED_WON" });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("RENTED");
  });
});
