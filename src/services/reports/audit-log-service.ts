import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { EXPORT_ROW_LIMIT, exportResponse, type ExportFormat } from "@/lib/export";
import { formatDateTime, todayInTimeZone } from "@/lib/format";
import { requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseSearchParams, toPaginated } from "@/lib/validation/common";
import { addDays, isIsoDate } from "./range";
import { zonedMidnight } from "./shared";

export const auditLogFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  action: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9_.]*$/i, "Invalid action filter")
    .optional(),
  userId: z.string().max(64).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditLogFilters = z.input<typeof auditLogFiltersSchema>;

function clean(raw: unknown): Record<string, string> {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === "string" && value !== "") out[k] = value;
  }
  return out;
}

function buildWhere(ctx: TenantContext, f: z.output<typeof auditLogFiltersSchema>): Prisma.AuditLogWhereInput {
  const tz = ctx.organization.timezone || "UTC";
  const createdAt: Prisma.DateTimeFilter = {};
  if (isIsoDate(f.from)) createdAt.gte = zonedMidnight(f.from, tz);
  if (isIsoDate(f.to)) createdAt.lt = zonedMidnight(addDays(f.to, 1), tz);
  return {
    // Never cross tenants: the organization always comes from the session.
    organizationId: ctx.organizationId,
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    ...(f.q
      ? {
          OR: [
            { action: { contains: f.q, mode: "insensitive" } },
            { entityType: { contains: f.q, mode: "insensitive" } },
            { entityId: { contains: f.q } },
            { ipAddress: { contains: f.q } },
            { user: { name: { contains: f.q, mode: "insensitive" } } },
            { user: { email: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

const auditSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Prisma.JsonValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: { id: string; name: string; email: string } | null;
};

export async function listAuditLogs(ctx: TenantContext, raw: unknown) {
  requirePermission(ctx, "audit.view");
  const f = parseSearchParams(auditLogFiltersSchema, clean(raw));
  const where = buildWhere(ctx, f);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: auditSelect,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return toPaginated<AuditLogEntry>(items, total, f.page, f.pageSize);
}

/** Filter options: entity prefixes and users seen in this organization's log. */
export async function getAuditLogFacets(ctx: TenantContext) {
  requirePermission(ctx, "audit.view");
  const [actions, users] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["action"], where: { organizationId: ctx.organizationId }, orderBy: { action: "asc" } }),
    prisma.auditLog.groupBy({ by: ["userId"], where: { organizationId: ctx.organizationId, userId: { not: null } } }),
  ]);
  const prefixes = [...new Set(actions.map((a) => a.action.split(".")[0]!).filter(Boolean))].sort();
  const people = await prisma.user.findMany({
    where: { id: { in: users.map((u) => u.userId).filter((id): id is string => !!id) } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return {
    actionPrefixes: prefixes.map((p) => ({ value: `${p}.`, label: humanize(p) })),
    users: people.map((u) => ({ value: u.id, label: u.name || u.email })),
  };
}

export async function exportAuditLogs(ctx: TenantContext, raw: unknown, format: ExportFormat) {
  requirePermission(ctx, "audit.view");
  const f = parseSearchParams(auditLogFiltersSchema, clean(raw));
  const rows = await prisma.auditLog.findMany({
    where: buildWhere(ctx, f),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_ROW_LIMIT,
    select: auditSelect,
  });
  const tz = ctx.organization.timezone;
  return exportResponse(
    format,
    `audit-log_${todayInTimeZone(tz)}`,
    [
      { header: "Time", value: (r) => formatDateTime(r.createdAt, tz), width: 22 },
      { header: "User", value: (r) => r.user?.name ?? "System", width: 22 },
      { header: "Email", value: (r) => r.user?.email ?? "", width: 28 },
      { header: "Action", value: (r) => r.action, width: 26 },
      { header: "Entity", value: (r) => r.entityType, width: 18 },
      { header: "Entity ID", value: (r) => r.entityId ?? "", width: 28 },
      { header: "IP address", value: (r) => r.ipAddress ?? "", width: 18 },
      { header: "Details", value: (r) => (r.metadata ? JSON.stringify(r.metadata).slice(0, 32_000) : ""), width: 60 },
    ],
    rows,
  );
}

export function humanize(value: string) {
  const s = value.replace(/[._]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
