import { describe, expect, it, beforeAll } from "vitest";
import { NotFoundError } from "@/lib/errors";
import { getHostel, listHostels, updateHostel, archiveHostel } from "@/services/hostel/hostel-service";
import { createFloor, getRoom, listRooms, listBeds, createBed, getRoomMap } from "@/services/hostel/structure-service";
import { createInvoice, cancelInvoice } from "@/services/finance/invoice-service";
import { recordPayment } from "@/services/finance/payment-service";
import { globalSearch } from "@/services/search/search-service";
import { listNotifications } from "@/services/notification/notification-service";
import { createHostelWithRoom, createResidentRow, createTenant, prisma } from "./helpers";
import type { TenantContext } from "@/lib/tenant/context";

/**
 * Tenant A must never read or mutate Tenant B's records, even when it knows
 * B's ids (simulating a user editing ids in the URL or API request).
 */
describe("tenant isolation", () => {
  let a: TenantContext;
  let b: TenantContext;
  let bHostelId: string;
  let bRoomId: string;
  let bBedId: string;
  let bResidentId: string;
  let bInvoiceId: string;

  beforeAll(async () => {
    const tenantA = await createTenant("Alpha Hostels");
    const tenantB = await createTenant("Beta Hostels");
    const setupA = await createHostelWithRoom(tenantA.ctx);
    const setupB = await createHostelWithRoom(tenantB.ctx);
    a = setupA.ctx;
    b = setupB.ctx;
    bHostelId = setupB.hostel.id;
    bRoomId = setupB.room.id;
    bBedId = setupB.beds[0]!.id;
    const resident = await createResidentRow(b, bHostelId, "Beta");
    bResidentId = resident.id;
    const invoice = await createInvoice(b, {
      residentId: resident.id,
      issueDate: "2026-09-01",
      items: [{ type: "MONTHLY_RENT", description: "Rent", quantity: 1, unitPrice: 10000 }],
    });
    bInvoiceId = invoice.id;
  });

  it("lists only the caller's hostels", async () => {
    const result = await listHostels(a);
    expect(result.items.map((h) => h.id)).not.toContain(bHostelId);
    expect(result.items.every((h) => h.organizationId === a.organizationId)).toBe(true);
  });

  it("cannot read another tenant's hostel by id", async () => {
    await expect(getHostel(a, bHostelId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot update or archive another tenant's hostel", async () => {
    await expect(updateHostel(a, bHostelId, { name: "Hijacked", code: "HIJACK" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveHostel(a, bHostelId)).rejects.toBeInstanceOf(NotFoundError);
    const untouched = await prisma.hostel.findUniqueOrThrow({ where: { id: bHostelId } });
    expect(untouched.name).not.toBe("Hijacked");
    expect(untouched.archivedAt).toBeNull();
  });

  it("cannot create floors in another tenant's hostel", async () => {
    await expect(createFloor(a, { hostelId: bHostelId, name: "Intruder", floorNumber: 9 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot read rooms, beds or the room map of another tenant", async () => {
    await expect(getRoom(a, bRoomId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRoomMap(a, bHostelId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createBed(a, { roomId: bRoomId, bedNumber: "99" })).rejects.toBeInstanceOf(NotFoundError);
    const rooms = await listRooms(a);
    expect(rooms.items.some((r) => r.id === bRoomId)).toBe(false);
    const beds = await listBeds(a);
    expect(beds.items.some((bed) => bed.id === bBedId)).toBe(false);
  });

  it("ignores a foreign hostelId passed as a list filter", async () => {
    const rooms = await listRooms(a, { hostelId: bHostelId });
    expect(rooms.items).toHaveLength(0);
  });

  it("cannot invoice or take payments for another tenant's resident or invoice", async () => {
    await expect(
      createInvoice(a, {
        residentId: bResidentId,
        issueDate: "2026-09-01",
        items: [{ type: "OTHER", description: "x", quantity: 1, unitPrice: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      recordPayment(a, { residentId: bResidentId, invoiceId: bInvoiceId, amount: 100, method: "CASH", paymentDate: "2026-09-02" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelInvoice(a, bInvoiceId, "not mine")).rejects.toBeInstanceOf(NotFoundError);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: bInvoiceId } });
    expect(invoice.status).not.toBe("CANCELLED");
  });

  it("global search never returns another tenant's records", async () => {
    const groups = await globalSearch(a, "Beta");
    const ids = groups.flatMap((g) => g.results.map((r) => r.id));
    expect(ids).not.toContain(bResidentId);
    expect(ids).not.toContain(bInvoiceId);
  });

  it("notifications are scoped to user and organization", async () => {
    await prisma.notification.create({
      data: { organizationId: b.organizationId, userId: b.userId, type: "SYSTEM", title: "Secret for B" },
    });
    const forA = await listNotifications(a.userId, a.organizationId);
    expect(forA.items.some((n) => n.title === "Secret for B")).toBe(false);
    // Even with B's organization id, A's user sees nothing of B's.
    const crossed = await listNotifications(a.userId, b.organizationId);
    expect(crossed.items).toHaveLength(0);
  });
});
