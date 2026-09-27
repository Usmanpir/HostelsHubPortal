import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ExpenseStatus, PaymentMethod } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import {
  accessWhere,
  actorOf,
  assertHostelAccess,
  requireAnyPermission,
  requirePermission,
  scopedWhere,
  type TenantContext,
} from "@/lib/tenant/context";
import { expenseCategorySchema, expenseSchema, voidSchema, type ExpenseCategoryInput, type ExpenseInput } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { dateOnly } from "@/lib/format";
import { EXPORT_ROW_LIMIT } from "@/lib/export";
import { claimUpload } from "@/services/files/file-service";

// ─── Categories ─────────────────────────────────────────────────────────────

export async function listExpenseCategories(ctx: TenantContext) {
  requireAnyPermission(ctx, "expenses.view", "expenses.manage");
  const rows = await prisma.expenseCategory.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, key: true, name: true, isSystem: true, _count: { select: { expenses: true } } },
  });
  return rows.map((c) => ({ id: c.id, key: c.key, name: c.name, isSystem: c.isSystem, expenseCount: c._count.expenses }));
}

export type ExpenseCategoryItem = Awaited<ReturnType<typeof listExpenseCategories>>[number];

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 50) || "category"
  );
}

export async function createExpenseCategory(ctx: TenantContext, raw: ExpenseCategoryInput) {
  requirePermission(ctx, "expenses.manage");
  const { name } = parseInput(expenseCategorySchema, raw);
  const clash = await prisma.expenseCategory.findFirst({
    where: { organizationId: ctx.organizationId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) throw new ConflictError(`A category named "${name}" already exists.`);

  const base = `custom-${slugify(name)}`;
  const taken = await prisma.expenseCategory.findMany({
    where: { organizationId: ctx.organizationId, key: { startsWith: base } },
    select: { key: true },
  });
  const keys = new Set(taken.map((t) => t.key));
  let key = base;
  for (let n = 2; keys.has(key); n++) key = `${base}-${n}`;

  return prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.create({
      data: { organizationId: ctx.organizationId, key, name, isSystem: false },
    });
    await audit(actorOf(ctx), { action: "expense_category.created", entityType: "ExpenseCategory", entityId: category.id, after: category }, tx);
    return category;
  });
}

/** Only unused custom categories can be removed; system ones and those with expenses stay. */
export async function deleteExpenseCategory(ctx: TenantContext, id: string) {
  requirePermission(ctx, "expenses.manage");
  await prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { _count: { select: { expenses: true } } },
    });
    if (!category) throw new NotFoundError("Category");
    if (category.isSystem) throw new BusinessRuleError("Built-in categories can't be deleted.");
    if (category._count.expenses > 0) {
      throw new BusinessRuleError(`This category is used by ${category._count.expenses} expense(s) and can't be deleted.`);
    }
    await tx.expenseCategory.delete({ where: { id } });
    await audit(
      actorOf(ctx),
      { action: "expense_category.deleted", entityType: "ExpenseCategory", entityId: id, before: { key: category.key, name: category.name } },
      tx,
    );
  });
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export const EXPENSE_SORTS = ["date", "amount"] as const;
export type ExpenseSort = (typeof EXPENSE_SORTS)[number];

export type ExpenseListFilters = {
  q?: string;
  categoryId?: string;
  hostelId?: string;
  status?: ExpenseStatus;
  from?: Date;
  to?: Date;
  sort?: ExpenseSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

function expenseWhere(ctx: TenantContext, f: ExpenseListFilters): Prisma.ExpenseWhereInput {
  const words = (f.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    ...scopedWhere(ctx, f.hostelId),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.from || f.to ? { date: { ...(f.from ? { gte: dateOnly(f.from) } : {}), ...(f.to ? { lte: dateOnly(f.to) } : {}) } } : {}),
    ...(words.length
      ? {
          AND: words.map((w) => ({
            OR: [
              { vendor: { contains: w, mode: "insensitive" as const } },
              { description: { contains: w, mode: "insensitive" as const } },
              { reference: { contains: w, mode: "insensitive" as const } },
            ],
          })),
        }
      : {}),
  };
}

function expenseOrder(sort?: ExpenseSort, dir: "asc" | "desc" = "desc"): Prisma.ExpenseOrderByWithRelationInput[] {
  if (sort === "amount") return [{ amount: dir }, { date: "desc" }];
  if (sort === "date") return [{ date: dir }, { createdAt: dir }];
  return [{ date: "desc" }, { createdAt: "desc" }];
}

const expenseInclude = {
  hostel: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, key: true } },
  receipt: { select: { id: true, originalName: true, size: true, mimeType: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

function toExpenseItem(e: ExpenseRow) {
  return {
    id: e.id,
    hostelId: e.hostelId,
    categoryId: e.categoryId,
    amount: toNumber(e.amount),
    date: e.date,
    vendor: e.vendor,
    description: e.description,
    paymentMethod: e.paymentMethod,
    reference: e.reference,
    status: e.status,
    voidedAt: e.voidedAt,
    voidReason: e.voidReason,
    createdAt: e.createdAt,
    hostel: e.hostel,
    category: e.category,
    receipt: e.receipt,
    createdBy: e.createdBy?.name ?? null,
  };
}

export type ExpenseItem = ReturnType<typeof toExpenseItem>;

export async function listExpenses(ctx: TenantContext, filters: ExpenseListFilters = {}) {
  requirePermission(ctx, "expenses.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where = expenseWhere(ctx, filters);
  const [rows, total] = await Promise.all([
    prisma.expense.findMany({ where, include: expenseInclude, orderBy: expenseOrder(filters.sort, filters.dir), skip, take }),
    prisma.expense.count({ where }),
  ]);
  return toPaginated(rows.map(toExpenseItem), total, page, pageSize);
}

export async function listExpensesForExport(ctx: TenantContext, filters: ExpenseListFilters = {}) {
  requirePermission(ctx, "expenses.view");
  const rows = await prisma.expense.findMany({
    where: expenseWhere(ctx, filters),
    include: expenseInclude,
    orderBy: expenseOrder(filters.sort, filters.dir),
    take: EXPORT_ROW_LIMIT,
  });
  return rows.map(toExpenseItem);
}

/** Recorded (non-voided) totals by category for the current filters. */
export async function getExpenseTotals(ctx: TenantContext, filters: ExpenseListFilters = {}) {
  requirePermission(ctx, "expenses.view");
  const where = { ...expenseWhere(ctx, { ...filters, status: undefined }), status: "RECORDED" as const };
  const [groups, categories] = await Promise.all([
    prisma.expense.groupBy({ by: ["categoryId"], where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expenseCategory.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = groups
    .map((g) => ({ categoryId: g.categoryId, name: names.get(g.categoryId) ?? "Uncategorised", total: round2(toNumber(g._sum.amount)), count: g._count._all }))
    .sort((a, b) => b.total - a.total);
  return {
    total: round2(byCategory.reduce((s, c) => s + c.total, 0)),
    count: byCategory.reduce((s, c) => s + c.count, 0),
    byCategory,
  };
}

export async function getExpense(ctx: TenantContext, id: string) {
  requirePermission(ctx, "expenses.view");
  const expense = await prisma.expense.findFirst({ where: { id, ...accessWhere(ctx) }, include: expenseInclude });
  if (!expense) throw new NotFoundError("Expense");
  return toExpenseItem(expense);
}

async function assertCategory(ctx: TenantContext, categoryId: string) {
  const category = await prisma.expenseCategory.findFirst({ where: { id: categoryId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!category) throw new NotFoundError("Category");
}

export async function createExpense(ctx: TenantContext, raw: ExpenseInput) {
  requirePermission(ctx, "expenses.manage");
  const input = parseInput(expenseSchema, raw);
  assertHostelAccess(ctx, input.hostelId);
  await assertCategory(ctx, input.categoryId);
  return prisma.$transaction(async (tx) => {
    if (input.receiptFileId) {
      await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, input.receiptFileId, ["expense-receipt"]);
    }
    const expense = await tx.expense.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: input.hostelId,
        categoryId: input.categoryId,
        amount: input.amount,
        date: dateOnly(input.date),
        vendor: input.vendor ?? null,
        description: input.description ?? null,
        paymentMethod: input.paymentMethod as PaymentMethod,
        reference: input.reference ?? null,
        receiptFileId: input.receiptFileId ?? null,
        createdById: ctx.userId,
      },
    });
    await audit(actorOf(ctx), { action: "expense.created", entityType: "Expense", entityId: expense.id, after: expense }, tx);
    return serialize(expense);
  });
}

export async function updateExpense(ctx: TenantContext, id: string, raw: ExpenseInput) {
  requirePermission(ctx, "expenses.manage");
  const input = parseInput(expenseSchema, raw);
  assertHostelAccess(ctx, input.hostelId);
  await assertCategory(ctx, input.categoryId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.expense.findFirst({ where: { id, ...accessWhere(ctx) } });
    if (!before) throw new NotFoundError("Expense");
    if (before.status === "VOIDED") throw new BusinessRuleError("Voided expenses can't be edited.");
    const receiptFileId = input.receiptFileId ?? null;
    if (receiptFileId && receiptFileId !== before.receiptFileId) {
      await claimUpload(tx, { organizationId: ctx.organizationId, userId: ctx.userId }, receiptFileId, ["expense-receipt"]);
    }
    const expense = await tx.expense.update({
      where: { id },
      data: {
        hostelId: input.hostelId,
        categoryId: input.categoryId,
        amount: input.amount,
        date: dateOnly(input.date),
        vendor: input.vendor ?? null,
        description: input.description ?? null,
        paymentMethod: input.paymentMethod as PaymentMethod,
        reference: input.reference ?? null,
        receiptFileId,
      },
    });
    await audit(actorOf(ctx), { action: "expense.updated", entityType: "Expense", entityId: id, before, after: expense }, tx);
    return serialize(expense);
  });
}

/** Expenses are never deleted — voided rows stay for the audit trail and are excluded from totals. */
export async function voidExpense(ctx: TenantContext, id: string, rawReason: string) {
  requirePermission(ctx, "expenses.manage");
  const { reason } = parseInput(voidSchema, { reason: rawReason });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.expense.findFirst({ where: { id, ...accessWhere(ctx) } });
    if (!before) throw new NotFoundError("Expense");
    if (before.status === "VOIDED") throw new BusinessRuleError("This expense is already voided.");
    const expense = await tx.expense.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason } });
    await audit(actorOf(ctx), { action: "expense.voided", entityType: "Expense", entityId: id, before, after: expense }, tx);
    return serialize(expense);
  });
}
