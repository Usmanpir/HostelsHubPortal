import { describe, expect, it, beforeAll } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { can, listHostelIds, type TenantContext } from "@/lib/tenant/context";
import { createHostel, listHostels, getHostel } from "@/services/hostel/hostel-service";
import { createFloor, listRooms, getRoom } from "@/services/hostel/structure-service";
import { createInvoice } from "@/services/finance/invoice-service";
import { globalSearch } from "@/services/search/search-service";
import { addMember, createHostelWithRoom, createResidentRow, createTenant, reload } from "./helpers";

describe("role-based access control", () => {
  let owner: TenantContext;
  let hostel1: { id: string };
  let hostel2: { id: string };
  let room2Id: string;

  beforeAll(async () => {
    const t = await createTenant("RBAC Org");
    const s1 = await createHostelWithRoom(t.ctx);
    const s2 = await createHostelWithRoom(s1.ctx);
    owner = await reload(s2.ctx);
    hostel1 = s1.hostel;
    hostel2 = s2.hostel;
    room2Id = s2.room.id;
    await createResidentRow(owner, hostel2.id, "Zainab");
  });

  it("owner has every permission and sees all hostels", async () => {
    expect(can(owner, "settings.billing")).toBe(true);
    expect(owner.allHostels).toBe(true);
    expect(listHostelIds(owner)).toBeUndefined();
  });

  it("accountant can bill but cannot manage hostels or residents", async () => {
    const accountant = await addMember(owner, "ACCOUNTANT");
    expect(can(accountant, "invoices.manage")).toBe(true);
    expect(can(accountant, "residents.view")).toBe(false);
    expect(can(accountant, "residents.manage")).toBe(false);
    await expect(createHostel(accountant, { name: "Nope", code: "NOPE" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createFloor(accountant, { hostelId: hostel1.id, name: "F", floorNumber: 5 })).rejects.toBeInstanceOf(ForbiddenError);
    // Search hides resident results from accountants.
    const groups = await globalSearch(accountant, "Zainab");
    expect(groups.find((g) => g.key === "residents")).toBeUndefined();
  });

  it("hostel-level staff only access assigned hostels", async () => {
    const manager = await addMember(owner, "HOSTEL_MANAGER", [hostel1.id]);
    expect(manager.allHostels).toBe(false);
    expect(manager.accessibleHostelIds).toEqual([hostel1.id]);
    // Restricted to exactly one hostel → automatically scoped to it.
    expect(manager.activeHostelId).toBe(hostel1.id);

    const hostels = await listHostels(manager);
    expect(hostels.items.map((h) => h.id)).toEqual([hostel1.id]);
    await expect(getHostel(manager, hostel2.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRoom(manager, room2Id)).rejects.toBeInstanceOf(NotFoundError);
    const rooms = await listRooms(manager);
    expect(rooms.items.every((r) => r.hostelId === hostel1.id)).toBe(true);
    await expect(createFloor(manager, { hostelId: hostel2.id, name: "X", floorNumber: 7 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("receptionist cannot create invoices", async () => {
    const receptionist = await addMember(owner, "RECEPTIONIST", [hostel1.id]);
    await expect(
      createInvoice(receptionist, {
        residentId: "anything",
        issueDate: "2026-09-01",
        items: [{ type: "OTHER", description: "x", quantity: 1, unitPrice: 1 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("staff role only sees tasks", async () => {
    const staff = await addMember(owner, "STAFF", [hostel1.id]);
    expect(can(staff, "tasks.view")).toBe(true);
    expect(can(staff, "dashboard.view")).toBe(false);
    expect(can(staff, "residents.view")).toBe(false);
    await expect(listHostels(staff)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a hostel switcher cookie for an inaccessible hostel is ignored", async () => {
    const manager = await addMember(owner, "WARDEN", [hostel1.id]);
    const tampered = await reload({ ...manager }, hostel2.id);
    expect(tampered.activeHostelId).not.toBe(hostel2.id);
  });
});
