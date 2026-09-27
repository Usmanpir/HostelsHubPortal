import type { ExpenseStatus, InvoiceStatus, PaymentMethod, PaymentStatus, PaymentType } from "@/generated/prisma/enums";
import { EXPENSE_STATUSES, INVOICE_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, PAYMENT_TYPES } from "@/lib/validation/finance";
import { INVOICE_SORTS, type InvoiceListFilters } from "./invoice-service";
import { PAYMENT_SORTS, type PaymentListFilters } from "./payment-service";
import { EXPENSE_SORTS, type ExpenseListFilters } from "./expense-service";

/**
 * Parse list filters from URL search params. Shared by pages, REST routes and
 * export routes so a filtered view exports exactly what is on screen.
 * Unknown/invalid values are ignored rather than rejected.
 */

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function getter(params: Params) {
  return (key: string): string | undefined => {
    const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return v === null || v === undefined || v === "" ? undefined : v.slice(0, 200);
  };
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function day(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function int(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function id(value: string | undefined) {
  return value && /^[\w-]{1,64}$/.test(value) ? value : undefined;
}

function common(get: ReturnType<typeof getter>) {
  return {
    q: get("q")?.slice(0, 100),
    from: day(get("from")),
    to: day(get("to")),
    hostelId: id(get("hostel")),
    dir: oneOf(get("dir"), ["asc", "desc"] as const),
    page: int(get("page"), 1),
    pageSize: Math.min(100, int(get("pageSize"), 20)),
  };
}

export function parseInvoiceFilters(params: Params): InvoiceListFilters {
  const get = getter(params);
  return {
    ...common(get),
    status: oneOf<InvoiceStatus | "RECEIVABLE">(get("status"), [...INVOICE_STATUSES, "RECEIVABLE"]),
    residentId: id(get("residentId")),
    sort: oneOf(get("sort"), INVOICE_SORTS),
  };
}

export function parsePaymentFilters(params: Params): PaymentListFilters {
  const get = getter(params);
  return {
    ...common(get),
    method: oneOf<PaymentMethod>(get("method"), PAYMENT_METHODS),
    type: oneOf<PaymentType>(get("type"), PAYMENT_TYPES),
    status: oneOf<PaymentStatus>(get("status"), PAYMENT_STATUSES),
    residentId: id(get("residentId")),
    invoiceId: id(get("invoiceId")),
    sort: oneOf(get("sort"), PAYMENT_SORTS),
  };
}

export function parseExpenseFilters(params: Params): ExpenseListFilters {
  const get = getter(params);
  return {
    ...common(get),
    categoryId: id(get("category")),
    status: oneOf<ExpenseStatus>(get("status"), EXPENSE_STATUSES),
    sort: oneOf(get("sort"), EXPENSE_SORTS),
  };
}

/** `?format=xlsx` or csv (default). */
export function exportFormat(params: URLSearchParams) {
  return params.get("format") === "xlsx" ? ("xlsx" as const) : ("csv" as const);
}
