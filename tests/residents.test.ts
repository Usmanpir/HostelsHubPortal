import { describe, expect, it, beforeAll } from "vitest";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { createResident, archiveResident } from "@/services/resident/resident-service";
import { checkIn, checkOut, transfer } from "@/services/resident/assignment-service";
import { getResidentBalance } from "@/services/finance/ledger";
import type { TenantContext } from "@/lib/tenant/context";
import { addMember, createHostelWithRoom, createTenant, prisma } from "./helpers";

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

describe("residents, check-in, transfer and check-out", () => {
  let ctx: TenantContext;
  let hostelId: string;
  let roomId: string;
  let bedIds: string[];

  const newResident = (firstName: string) =>
    createResident(ctx, { hostelId, firstName, lastName: "Tester", phone: "+923001112233", joiningDate: daysAgo(30) });

  beforeAll(async () => {
    const t = await createTenant("Residents Org");
    const s = await createHostelWithRoom(t.ctx, 2, 12000);
    ctx = s.ctx;
    hostelId = s.hostel.id;
    roomId = s.room.id;
    bedIds = s.beds.map((b) => b.id);
  });

  it("creates a resident with a sequential code and audit entry", async () => {
    const r = await newResident("Ayesha");
    expect(r.residentCode).toMatch(/^RES-\d{4}$/);
    expect(r.organizationId).toBe(ctx.organizationId);
    expect(await prisma.auditLog.count({ where: { entityId: r.id } })).toBeGreaterThan(0);
  });

  it("checks in to an available bed, marking bed and room occupied", async () => {
    const r = await newResident("Bilal");
    await checkIn(ctx, { residentId: r.id, bedId: bedIds[0]!, checkInDate: daysAgo(20), monthlyRent: 12000, securityDeposit: 12000 });
    const bed = await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0]! } });
    expect(bed.status).toBe("OCCUPIED");
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.status).toBe("PARTIALLY_OCCUPIED");
  });

  it("a bed cannot have two active residents", async () => {
    const r = await newResident("Chand");
    await expect(
      checkIn(ctx, { residentId: r.id, bedId: bedIds[0]!, checkInDate: daysAgo(5), monthlyRent: 12000 }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("concurrent check-ins to the same bed: exactly one wins", async () => {
    const a = await newResident("Dania");
    const b = await newResident("Ehsan");
    const results = await Promise.allSettled(
      [a, b].map((r) => checkIn(ctx, { residentId: r.id, bedId: bedIds[1]!, checkInDate: daysAgo(3), monthlyRent: 12000 })),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.residentAssignment.count({ where: { bedId: bedIds[1]!, status: "ACTIVE" } })).toBe(1);
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.status).toBe("FULL");
  });

  it("a resident cannot hold two active assignments", async () => {
    const extra = await createHostelWithRoom(ctx, 1);
    ctx = extra.ctx;
    const holder = await prisma.residentAssignment.findFirstOrThrow({ where: { bedId: bedIds[0]!, status: "ACTIVE" } });
    await expect(
      checkIn(ctx, { residentId: holder.residentId, bedId: extra.beds[0]!.id, checkInDate: daysAgo(1), monthlyRent: 9000 }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("transfers keep history and free the old bed", async () => {
    const extra = await createHostelWithRoom(ctx, 1);
    ctx = extra.ctx;
    const holder = await prisma.residentAssignment.findFirstOrThrow({ where: { bedId: bedIds[0]!, status: "ACTIVE" } });
    await transfer(ctx, { residentId: holder.residentId, toBedId: extra.beds[0]!.id, transferDate: daysAgo(1), monthlyRent: 9500 });

    const history = await prisma.residentAssignment.findMany({ where: { residentId: holder.residentId }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => h.status)).toEqual(["TRANSFERRED", "ACTIVE"]);
    expect(history[1]!.previousAssignmentId).toBe(history[0]!.id);
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0]! } })).status).toBe("AVAILABLE");
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: extra.beds[0]!.id } })).status).toBe("OCCUPIED");
    // Resident moved to the other hostel.
    expect((await prisma.resident.findUniqueOrThrow({ where: { id: holder.residentId } })).hostelId).toBe(extra.hostel.id);
  });

  it("check-out settles the deposit, frees the bed and leaves no active assignment", async () => {
    const r = await newResident("Farah");
    await checkIn(ctx, { residentId: r.id, bedId: bedIds[0]!, checkInDate: daysAgo(40), monthlyRent: 12000, securityDeposit: 10000 });
    await expect(
      checkOut(ctx, { residentId: r.id, checkOutDate: today, depositDeduction: 6000, depositRefund: 6000 }),
    ).rejects.toBeInstanceOf(Error); // deduction + refund exceed the deposit

    await checkOut(ctx, {
      residentId: r.id,
      checkOutDate: today,
      depositDeduction: 1500,
      depositRefund: 8500,
      refundMethod: "CASH",
      finalCharges: [{ type: "ELECTRICITY", description: "Final meter", amount: 800 }],
    });
    const resident = await prisma.resident.findUniqueOrThrow({ where: { id: r.id } });
    expect(resident.status).toBe("CHECKED_OUT");
    expect(await prisma.residentAssignment.count({ where: { residentId: r.id, status: { in: ["ACTIVE", "RESERVED"] } } })).toBe(0);
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0]! } })).status).toBe("AVAILABLE");
    const refund = await prisma.payment.findFirst({ where: { residentId: r.id, type: "REFUND" } });
    expect(Number(refund?.amount)).toBe(8500);
    expect((await getResidentBalance(ctx.organizationId, r.id)).outstanding).toBe(800);
    // Checked-out residents can't be checked out again.
    await expect(checkOut(ctx, { residentId: r.id, checkOutDate: today })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("residents with a live stay cannot be archived; archived residents stay in history", async () => {
    const live = await prisma.residentAssignment.findFirstOrThrow({ where: { organizationId: ctx.organizationId, status: "ACTIVE" } });
    await expect(archiveResident(ctx, live.residentId)).rejects.toBeInstanceOf(BusinessRuleError);
    const out = await prisma.resident.findFirstOrThrow({ where: { organizationId: ctx.organizationId, status: "CHECKED_OUT" } });
    await archiveResident(ctx, out.id);
    const archived = await prisma.resident.findUniqueOrThrow({ where: { id: out.id } });
    expect(archived.archivedAt).not.toBeNull();
    expect(await prisma.residentAssignment.count({ where: { residentId: out.id } })).toBeGreaterThan(0);
  });

  it("accountants cannot manage residents; hostel staff cannot check into other hostels", async () => {
    const accountant = await addMember(ctx, "ACCOUNTANT");
    await expect(
      createResident(accountant, { hostelId, firstName: "No", lastName: "Access", phone: "+923000000000", joiningDate: today }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // (The trial plan allows 3 hostels — reuse one created earlier in this suite.)
    const otherHostel = await prisma.hostel.findFirstOrThrow({ where: { organizationId: ctx.organizationId, id: { not: hostelId } } });
    const receptionist = await addMember(ctx, "RECEPTIONIST", [otherHostel.id]);
    const r = await newResident("Ghazal");
    await expect(
      checkIn(receptionist, { residentId: r.id, bedId: bedIds[1]!, checkInDate: today, monthlyRent: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
