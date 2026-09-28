import "server-only";
import { z } from "zod";
import { isAppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import { getDashboardSummary } from "@/services/dashboard/dashboard-service";
import { listHostels } from "@/services/hostel/hostel-service";
import { getOccupancy } from "@/services/hostel/occupancy";
import { getResident, listResidents } from "@/services/resident/resident-service";
import { getResidentBalance } from "@/services/finance/ledger";
import { listInvoices } from "@/services/finance/invoice-service";
import { listPayments } from "@/services/finance/payment-service";
import { getFinanceSummary } from "@/services/finance/finance-dashboard-service";
import { listStaff } from "@/services/staff/staff-service";
import { listMaintenance } from "@/services/operations/maintenance-service";
import { listComplaints } from "@/services/operations/complaint-service";
import { getVisitorStats } from "@/services/operations/visitor-service";
import { runReport } from "@/services/reports/report-service";
import { todayInTimeZone } from "@/lib/format";

/** A read-only tool: Zod input schema (validated before running) + implementation. */
export type AssistantTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  inputSchema: S;
  run: (input: z.output<S>) => Promise<string>;
};

function defineTool<S extends z.ZodType>(tool: AssistantTool<S>): AssistantTool {
  return tool as unknown as AssistantTool;
}

/**
 * Read-only tools the assistant can call. Every tool runs an existing service
 * with the signed-in member's TenantContext, so the assistant sees exactly
 * what the user is allowed to see: tenant isolation, hostel scope and
 * permission checks are enforced by the services, not by the model.
 */

const MAX_RESULT_CHARS = 24_000;
const LIST_LIMIT = 25;

const REPORT_KEYS = [
  "occupancy",
  "vacancy",
  "residents",
  "check-ins",
  "check-outs",
  "rent-collection",
  "outstanding",
  "revenue",
  "expenses",
  "profit-loss",
  "staff-attendance",
  "staff-payroll",
  "maintenance",
  "complaints",
  "visitors",
] as const;

const optionalHostel = z
  .string()
  .max(64)
  .optional()
  .describe("Hostel id from list_hostels. Omit to use the user's current hostel selection.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** JSON for the model: Dates as ISO strings, size-capped so one tool can't flood the context. */
function toResult(data: unknown): string {
  const json = JSON.stringify(data, (_key, value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value));
  return json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}… [truncated]` : json;
}

/** Permission/not-found errors become a message the model can relay; anything else is rethrown. */
async function safely(fn: () => Promise<unknown>): Promise<string> {
  try {
    return toResult(await fn());
  } catch (error) {
    if (isAppError(error) && error.code !== "INTERNAL_ERROR") {
      return toResult({ error: error.code, message: error.message });
    }
    throw error;
  }
}

export function buildAssistantTools(ctx: TenantContext): AssistantTool[] {
  const today = todayInTimeZone(ctx.organization.timezone || "UTC");
  const monthStart = `${today.slice(0, 8)}01`;

  return [
    defineTool({
      name: "get_dashboard_summary",
      description:
        "Organization overview for the current hostel selection: hostels, rooms, beds, occupancy, active residents, staff, and (if permitted) this month's revenue, collections, outstanding and expenses. Start here for broad questions.",
      inputSchema: z.object({}),
      run: () => safely(() => getDashboardSummary(ctx)),
    }),

    defineTool({
      name: "list_hostels",
      description: "List the hostels the user can access, with ids, codes, cities, status and occupancy. Use the ids to filter other tools.",
      inputSchema: z.object({ q: z.string().max(100).optional().describe("Filter by name, code or city") }),
      run: ({ q }) =>
        safely(async () => {
          const res = await listHostels(ctx, { q, pageSize: 50 });
          return res.items.map((h) => ({
            id: h.id,
            name: h.name,
            code: h.code,
            city: h.city,
            status: h.status,
            floors: h._count.floors,
            rooms: h._count.rooms,
            occupancy: h.occupancy,
          }));
        }),
    }),

    defineTool({
      name: "get_occupancy",
      description: "Bed occupancy (total, occupied, available, reserved, maintenance, occupancy rate %) overall and per hostel.",
      inputSchema: z.object({ hostelId: optionalHostel }),
      run: ({ hostelId }) =>
        safely(async () => {
          const { overall, byHostel } = await getOccupancy(ctx, hostelId);
          return { overall, byHostel: Object.fromEntries(byHostel) };
        }),
    }),

    defineTool({
      name: "search_residents",
      description:
        "Search residents by name, code, phone, email or CNIC, optionally by status or whether they have a bed. Returns hostel, room, bed, rent and balance.",
      inputSchema: z.object({
        q: z.string().max(100).optional(),
        status: z.enum(["ACTIVE", "NOTICE", "CHECKED_OUT", "SUSPENDED", "ARCHIVED", "ALL"]).optional(),
        assigned: z.enum(["yes", "no"]).optional().describe('"no" = active residents without a bed'),
        hostelId: optionalHostel,
      }),
      run: (input) =>
        safely(async () => {
          const res = await listResidents(ctx, { ...input, pageSize: LIST_LIMIT });
          return { total: res.total, showing: res.items.length, residents: res.items };
        }),
    }),

    defineTool({
      name: "get_resident_details",
      description: "Full profile of one resident (by id from search_residents): contact, current stay, stay history and balance.",
      inputSchema: z.object({ residentId: z.string().min(1).max(64) }),
      run: ({ residentId }) =>
        safely(async () => {
          const resident = await getResident(ctx, residentId);
          const balance = await getResidentBalance(ctx.organizationId, resident.id);
          return { resident, balance };
        }),
    }),

    defineTool({
      name: "search_staff",
      description: "Search staff by name, code or phone; filter by designation or status.",
      inputSchema: z.object({
        q: z.string().max(100).optional(),
        designation: z
          .enum(["MANAGER", "WARDEN", "RECEPTIONIST", "SECURITY_GUARD", "CLEANER", "COOK", "MAINTENANCE", "ACCOUNTANT", "OTHER"])
          .optional(),
        status: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED", "RESIGNED"]).optional(),
        hostelId: optionalHostel,
      }),
      run: (input) =>
        safely(async () => {
          const res = await listStaff(ctx, { ...input, pageSize: LIST_LIMIT });
          return { total: res.total, showing: res.items.length, staff: res.items };
        }),
    }),

    defineTool({
      name: "list_invoices",
      description:
        'List invoices. status "RECEIVABLE" = pending, partially paid or overdue; "OVERDUE" = past due. Optional search by invoice number or resident name and an issue-date range.',
      inputSchema: z.object({
        status: z.enum(["DRAFT", "PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED", "RECEIVABLE"]).optional(),
        q: z.string().max(100).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        hostelId: optionalHostel,
      }),
      run: ({ from, to, ...rest }) =>
        safely(async () => {
          const res = await listInvoices(ctx, {
            ...rest,
            from: from ? new Date(`${from}T00:00:00Z`) : undefined,
            to: to ? new Date(`${to}T00:00:00Z`) : undefined,
            pageSize: LIST_LIMIT,
          });
          return { total: res.total, showing: res.items.length, invoices: res.items };
        }),
    }),

    defineTool({
      name: "list_payments",
      description: "List recent payments (receipt number, resident, amount, method, date), newest first.",
      inputSchema: z.object({ q: z.string().max(100).optional(), hostelId: optionalHostel }),
      run: (input) =>
        safely(async () => {
          const res = await listPayments(ctx, { ...input, pageSize: LIST_LIMIT });
          return { total: res.total, showing: res.items.length, payments: res.items };
        }),
    }),

    defineTool({
      name: "get_finance_summary",
      description: `Financial summary for a date range: revenue billed, cash collected, refunds, outstanding, overdue, expenses and net income. Defaults to this month (${monthStart} to ${today}).`,
      inputSchema: z.object({ from: isoDate.optional(), to: isoDate.optional(), hostelId: optionalHostel }),
      run: ({ from, to, hostelId }) => safely(() => getFinanceSummary(ctx, { from: from ?? monthStart, to: to ?? today, hostelId })),
    }),

    defineTool({
      name: "list_maintenance",
      description: 'List maintenance requests. state "open" = not completed or rejected.',
      inputSchema: z.object({
        state: z.enum(["open", "closed"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        q: z.string().max(100).optional(),
        hostelId: optionalHostel,
      }),
      run: (input) =>
        safely(async () => {
          const res = await listMaintenance(ctx, { ...input, pageSize: LIST_LIMIT });
          return res;
        }),
    }),

    defineTool({
      name: "list_complaints",
      description: 'List complaints. state "open" = not resolved or closed.',
      inputSchema: z.object({
        state: z.enum(["open", "closed"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        q: z.string().max(100).optional(),
        hostelId: optionalHostel,
      }),
      run: (input) =>
        safely(async () => {
          const res = await listComplaints(ctx, { ...input, pageSize: LIST_LIMIT });
          return res;
        }),
    }),

    defineTool({
      name: "get_visitor_stats",
      description: "Today's visitor counts: visitors today, currently inside, completed visits.",
      inputSchema: z.object({ hostelId: optionalHostel }),
      run: ({ hostelId }) => safely(() => getVisitorStats(ctx, hostelId)),
    }),

    defineTool({
      name: "run_report",
      description: `Run one of the built-in reports for a date range and get its summary and first rows. Reports: ${REPORT_KEYS.join(", ")}. "outstanding" includes aging buckets; "profit-loss" is cash-basis.`,
      inputSchema: z.object({
        report: z.enum(REPORT_KEYS),
        from: isoDate.optional(),
        to: isoDate.optional(),
        hostelId: optionalHostel,
      }),
      run: ({ report, from, to, hostelId }) =>
        safely(() =>
          runReport(ctx, report, {
            ...(from ? { from, preset: "custom" } : {}),
            ...(to ? { to } : {}),
            ...(hostelId ? { hostelId } : {}),
            pageSize: String(LIST_LIMIT),
          }),
        ),
    }),
  ];
}
