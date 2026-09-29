import { describe, expect, it, beforeAll } from "vitest";
import { BusinessRuleError, ValidationError } from "@/lib/errors";
import { dateOnly, todayInTimeZone } from "@/lib/format";
import { createHostel } from "@/services/hostel/hostel-service";
import { bulkCreateRooms, createFloor, createRoom, updateRoom } from "@/services/hostel/structure-service";
import { checkIn, renewLease } from "@/services/resident/assignment-service";
import { addMonthsUtc } from "@/services/resident/shared";
import { applyRentIncrements, applyScheduledRentChanges, sendLeaseExpiryReminders } from "@/services/jobs/lease-jobs";
import type { TenantContext } from "@/lib/tenant/context";
import { createResidentRow, createTenant, prisma, reload } from "./helpers";

const DAY = 86400_000;

describe("whole-unit properties and leases", () => {
  let ctx: TenantContext;
  let hostelId: string;
  let floorId: string;
  let today: Date;
  const org = () => ({ id: ctx.organizationId, currency: "PKR", locale: "en" });

  beforeAll(async () => {
    const t = await createTenant("Lease Org");
    await prisma.organization.update({ where: { id: t.org.id }, data: { businessType: "PROPERTY_MANAGEMENT" } });
    const base = await reload(t.ctx);
    const hostel = await createHostel(base, {
      name: "Blue Area Apartments",
      code: "BAA",
      kind: "APARTMENT_BUILDING",
      rentalMode: "WHOLE_UNIT",
      defaultBedRent: 50000,
    });
    ctx = await reload(base);
    hostelId = hostel.id;
    floorId = (await createFloor(ctx, { hostelId, name: "Ground", floorNumber: 0 })).id;
    today = dateOnly(todayInTimeZone(ctx.organization.timezone));
  });

  async function newUnit(roomNumber: string) {
    const room = await createRoom(ctx, { floorId, roomNumber, roomType: "APARTMENT", capacity: 1, createBeds: 0, bedrooms: 2, bathrooms: 1, areaSqft: 950, furnished: true });
    const bed = await prisma.bed.findFirstOrThrow({ where: { roomId: room.id } });
    return { room, bed };
  }

  it("a whole unit always gets exactly one bed and keeps its unit details", async () => {
    const { room } = await newUnit("A-1");
    expect(await prisma.bed.count({ where: { roomId: room.id } })).toBe(1);
    const stored = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(stored).toMatchObject({ bedrooms: 2, bathrooms: 1, areaSqft: 950, furnished: true, capacity: 1 });
  });

  it("whole-unit rooms can't hold more than one tenant", async () => {
    await expect(createRoom(ctx, { floorId, roomNumber: "A-2", roomType: "APARTMENT", capacity: 2 })).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(bulkCreateRooms(ctx, { floorId, prefix: "X", startNumber: 1, count: 2, roomType: "SHOP", capacity: 3 })).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    const { room } = await newUnit("A-3");
    await expect(updateRoom(ctx, room.id, { floorId, roomNumber: "A-3", roomType: "APARTMENT", capacity: 2 })).rejects.toBeInstanceOf(BusinessRuleError);

    const bulk = await bulkCreateRooms(ctx, { floorId, prefix: "S", startNumber: 1, count: 2, roomType: "SHOP", capacity: 1, areaSqft: 300 });
    expect(bulk.created).toBe(2);
    expect(await prisma.bed.count({ where: { room: { floorId, roomNumber: { in: ["S1", "S2"] } } } })).toBe(2);
  });

  it("checks in with lease terms, schedules the first increment and bills advance rent", async () => {
    const { bed } = await newUnit("L-1");
    const resident = await createResidentRow(ctx, hostelId, "Tenant");
    const leaseEnd = addMonthsUtc(today, 11);
    const result = await checkIn(ctx, {
      residentId: resident.id,
      bedId: bed.id,
      checkInDate: today,
      monthlyRent: 50000,
      securityDeposit: 100000,
      leaseEndDate: leaseEnd,
      noticePeriodDays: 30,
      advanceRent: 100000,
      rentIncrementPercent: 10,
      leaseTerms: "No subletting.",
      generateInvoice: { includeRent: true, includeDeposit: true, includeAdmissionFee: false },
    });
    const a = await prisma.residentAssignment.findUniqueOrThrow({ where: { id: result.assignment.id } });
    expect(a.leaseEndDate?.toISOString()).toBe(leaseEnd.toISOString());
    expect(a.noticePeriodDays).toBe(30);
    expect(Number(a.advanceRent)).toBe(100000);
    expect(Number(a.rentIncrementPercent)).toBe(10);
    expect(a.incrementIntervalMonths).toBe(12);
    expect(a.nextIncrementDate?.toISOString()).toBe(addMonthsUtc(today, 12).toISOString());

    const items = await prisma.invoiceItem.findMany({ where: { invoice: { id: result.invoiceId! } } });
    expect(items.find((i) => i.description === "Advance rent")).toMatchObject({ type: "OTHER" });
    expect(items.map((i) => i.type).sort()).toEqual(["MONTHLY_RENT", "OTHER", "SECURITY_DEPOSIT"]);
  });

  it("rejects a lease that ends before the move-in date", async () => {
    const { bed } = await newUnit("L-2");
    const resident = await createResidentRow(ctx, hostelId, "Early");
    await expect(
      checkIn(ctx, { residentId: resident.id, bedId: bed.id, checkInDate: today, monthlyRent: 40000, leaseEndDate: new Date(today.getTime() - DAY) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("applies a due rent increment exactly once and schedules the next one", async () => {
    const { bed } = await newUnit("L-3");
    const resident = await createResidentRow(ctx, hostelId, "Increment");
    const res = await checkIn(ctx, {
      residentId: resident.id,
      bedId: bed.id,
      checkInDate: today,
      monthlyRent: 40000,
      rentIncrementPercent: 5,
      incrementIntervalMonths: 6,
    });
    await prisma.residentAssignment.update({ where: { id: res.assignment.id }, data: { nextIncrementDate: today } });

    const first = await applyRentIncrements(org(), today);
    expect(first).toBeGreaterThanOrEqual(1);
    const second = await applyRentIncrements(org(), today);
    expect(second).toBe(0);

    const a = await prisma.residentAssignment.findUniqueOrThrow({ where: { id: res.assignment.id } });
    expect(Number(a.monthlyRent)).toBe(42000);
    expect(a.nextIncrementDate?.toISOString()).toBe(addMonthsUtc(today, 6).toISOString());
    expect(await prisma.auditLog.count({ where: { action: "lease.rent_increased", entityId: a.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { organizationId: ctx.organizationId, type: "RENT_INCREASED", userId: ctx.userId } })).toBeGreaterThanOrEqual(1);
  });

  it("sends lease expiry reminders once per threshold", async () => {
    const { bed } = await newUnit("L-4");
    const resident = await createResidentRow(ctx, hostelId, "Expiring");
    const res = await checkIn(ctx, {
      residentId: resident.id,
      bedId: bed.id,
      checkInDate: today,
      monthlyRent: 30000,
      leaseEndDate: new Date(today.getTime() + 30 * DAY),
    });
    const link = `/residents/${resident.id}`;
    const count = () => prisma.notification.count({ where: { organizationId: ctx.organizationId, type: "LEASE_EXPIRING", link, userId: ctx.userId } });

    expect(await sendLeaseExpiryReminders(org(), today)).toBeGreaterThanOrEqual(1);
    expect(await count()).toBe(1);
    await sendLeaseExpiryReminders(org(), today);
    await sendLeaseExpiryReminders(org(), new Date(today.getTime() + DAY)); // next day, still inside the window
    expect(await count()).toBe(1);

    // The 7-day threshold is a separate reminder.
    await sendLeaseExpiryReminders(org(), new Date(today.getTime() + 23 * DAY));
    expect(await count()).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "lease.expiry_reminder", entityId: res.assignment.id } })).toBe(2);
  });

  it("renews a lease, applying a rent change now or on its effective date", async () => {
    const { bed } = await newUnit("L-5");
    const resident = await createResidentRow(ctx, hostelId, "Renew");
    const res = await checkIn(ctx, {
      residentId: resident.id,
      bedId: bed.id,
      checkInDate: today,
      monthlyRent: 30000,
      leaseEndDate: new Date(today.getTime() + 10 * DAY),
    });
    const id = res.assignment.id;

    await renewLease(ctx, { assignmentId: id, leaseEndDate: addMonthsUtc(today, 12), newMonthlyRent: 33000 });
    let a = await prisma.residentAssignment.findUniqueOrThrow({ where: { id } });
    expect(Number(a.monthlyRent)).toBe(33000);
    expect(a.leaseEndDate?.toISOString()).toBe(addMonthsUtc(today, 12).toISOString());
    expect(await prisma.auditLog.count({ where: { action: "lease.renewed", entityId: id } })).toBe(1);

    const effective = new Date(today.getTime() + 5 * DAY);
    await renewLease(ctx, { assignmentId: id, leaseEndDate: addMonthsUtc(today, 24), newMonthlyRent: 36000, rentEffectiveDate: effective });
    a = await prisma.residentAssignment.findUniqueOrThrow({ where: { id } });
    expect(Number(a.monthlyRent)).toBe(33000); // not yet

    expect(await applyScheduledRentChanges(org(), today)).toBe(0);
    expect(await applyScheduledRentChanges(org(), effective)).toBe(1);
    expect(await applyScheduledRentChanges(org(), effective)).toBe(0);
    a = await prisma.residentAssignment.findUniqueOrThrow({ where: { id } });
    expect(Number(a.monthlyRent)).toBe(36000);

    await expect(renewLease(ctx, { assignmentId: id, leaseEndDate: new Date(today.getTime() - DAY) })).rejects.toBeInstanceOf(ValidationError);
  });
});
