import { describe, expect, it, beforeAll } from "vitest";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { createStaff, getStaff, listStaff } from "@/services/staff/staff-service";
import { createExpense, voidExpense } from "@/services/finance/expense-service";
import { registerUser, changePassword } from "@/services/auth/auth-service";
import { verifyPassword } from "@/lib/auth/password";
import { hit } from "@/lib/security/rate-limit";
import { loadTenantContext, type TenantContext } from "@/lib/tenant/context";
import { addMember, createHostelWithRoom, createTenant, prisma } from "./helpers";

describe("staff permissions and scoping", () => {
  let owner: TenantContext;
  let h1: string;
  let h2: string;

  beforeAll(async () => {
    const t = await createTenant("Staff Org");
    const a = await createHostelWithRoom(t.ctx);
    const b = await createHostelWithRoom(a.ctx);
    owner = b.ctx;
    h1 = a.hostel.id;
    h2 = b.hostel.id;
  });

  it("creates staff assigned to hostels with an employee code", async () => {
    const s = await createStaff(owner, { firstName: "Gul", lastName: "Khan", phone: "+923001234567", joiningDate: "2026-01-01", designation: "SECURITY_GUARD", salary: 35000, hostelIds: [h1, h2], primaryHostelId: h1 });
    expect(s.employeeCode).toMatch(/^EMP-\d{4}$/);
    expect(await prisma.staffHostelAssignment.count({ where: { staffId: s.id } })).toBe(2);
  });

  it("hostel-scoped members only see staff of their hostels", async () => {
    const only2 = await createStaff(owner, { firstName: "Only", lastName: "Two", phone: "+923001234568", joiningDate: "2026-01-01", hostelIds: [h2] });
    const manager = await addMember(owner, "HOSTEL_MANAGER", [h1]);
    const list = await listStaff(manager);
    expect(list.items.some((s) => s.id === only2.id)).toBe(false);
    await expect(getStaff(manager, only2.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("only staff.manage can create staff; accountants cannot", async () => {
    const accountant = await addMember(owner, "ACCOUNTANT");
    await expect(
      createStaff(accountant, { firstName: "X", lastName: "Y", phone: "+923001234569", joiningDate: "2026-01-01", hostelIds: [h1] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const warden = await addMember(owner, "WARDEN", [h1]);
    await expect(
      createStaff(warden, { firstName: "X", lastName: "Y", phone: "+923001234569", joiningDate: "2026-01-01", hostelIds: [h1] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("expenses", () => {
  let ctx: TenantContext;
  let hostelId: string;
  let categoryId: string;

  beforeAll(async () => {
    const t = await createTenant("Expense Org");
    const s = await createHostelWithRoom(t.ctx);
    ctx = s.ctx;
    hostelId = s.hostel.id;
    categoryId = (await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: ctx.organizationId, key: "electricity" } })).id;
  });

  it("records an expense with audit and voids it (never deleted)", async () => {
    const e = await createExpense(ctx, { hostelId, categoryId, amount: 45000, date: "2026-09-01", vendor: "IESCO" });
    expect(e.amount).toBe(45000);
    await expect(voidExpense(ctx, e.id, "no")).rejects.toBeInstanceOf(ValidationError);
    await voidExpense(ctx, e.id, "Duplicate entry");
    const row = await prisma.expense.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.status).toBe("VOIDED");
    await expect(voidExpense(ctx, e.id, "Again please")).rejects.toBeInstanceOf(BusinessRuleError);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: e.id } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["expense.created", "expense.voided"]));
  });

  it("rejects categories and hostels from another tenant", async () => {
    const other = await createTenant("Other Expense Org");
    const otherCategory = await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: other.org.id } });
    await expect(createExpense(ctx, { hostelId, categoryId: otherCategory.id, amount: 10, date: "2026-09-01" })).rejects.toBeInstanceOf(NotFoundError);
    const otherHostel = await createHostelWithRoom(other.ctx);
    await expect(createExpense(ctx, { hostelId: otherHostel.hostel.id, categoryId, amount: 10, date: "2026-09-01" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("receptionists cannot record expenses", async () => {
    const receptionist = await addMember(ctx, "RECEPTIONIST", [hostelId]);
    await expect(createExpense(receptionist, { hostelId, categoryId, amount: 10, date: "2026-09-01" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("authentication", () => {
  it("registers with a hashed password and rejects duplicate emails", async () => {
    const email = `new-${Date.now()}@test.local`;
    await registerUser({ name: "New Owner", email, password: "Secret123", confirmPassword: "Secret123" });
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.passwordHash).not.toContain("Secret123");
    expect(await verifyPassword("Secret123", u.passwordHash)).toBe(true);
    await expect(registerUser({ name: "Dup", email, password: "Secret123", confirmPassword: "Secret123" })).rejects.toBeTruthy();
    // A new user has no organization until onboarding.
    expect(await loadTenantContext(prisma, { userId: u.id })).toBeNull();
  });

  it("rejects weak passwords", async () => {
    await expect(
      registerUser({ name: "Weak", email: `weak-${Date.now()}@test.local`, password: "short", confirmPassword: "short" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("changing a password invalidates existing sessions", async () => {
    const email = `chg-${Date.now()}@test.local`;
    await registerUser({ name: "Changer", email, password: "Secret123", confirmPassword: "Secret123" });
    const before = await prisma.user.findUniqueOrThrow({ where: { email } });
    await expect(
      changePassword(before.id, { currentPassword: "Wrong1234", newPassword: "Better123", confirmPassword: "Better123" }),
    ).rejects.toBeTruthy();
    await changePassword(before.id, { currentPassword: "Secret123", newPassword: "Better123", confirmPassword: "Better123" });
    const after = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect(await verifyPassword("Better123", after.passwordHash)).toBe(true);
  });

  it("rate limits repeated attempts", async () => {
    const key = `test-limit-${Date.now()}`;
    const rule = { limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await hit(key, rule)).allowed);
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("disabled users get no tenant context", async () => {
    const t = await createTenant("Disabled Org");
    await prisma.user.update({ where: { id: t.owner.id }, data: { status: "DISABLED" } });
    expect(await loadTenantContext(prisma, { userId: t.owner.id })).toBeNull();
  });
});
