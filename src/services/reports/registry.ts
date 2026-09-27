/**
 * Single source of truth for the report catalog. Pure data (client-safe):
 * the hub, report pages, JSON API and export API all read these definitions.
 */
import type { Permission } from "@/lib/permissions/catalog";
import { complaintStatusLabels, maintenanceStatusLabels, optionsFrom, payrollStatusLabels, residentStatusLabels } from "@/config/labels";
import type { RangePreset } from "./range";

export const REPORT_GROUPS = [
  { key: "occupancy", label: "Occupancy", description: "Beds, rooms and vacancy across your properties." },
  { key: "residents", label: "Residents", description: "Admissions, check-ins and check-outs." },
  { key: "finance", label: "Finance", description: "Billing, collections, dues and profitability." },
  { key: "staff", label: "Staff", description: "Attendance and payroll." },
  { key: "operations", label: "Operations", description: "Maintenance, complaints and visitors." },
] as const;

export type ReportGroup = (typeof REPORT_GROUPS)[number]["key"];

export type ReportIcon =
  | "bed"
  | "door"
  | "users"
  | "login"
  | "logout"
  | "wallet"
  | "alarm"
  | "trending"
  | "receipt"
  | "scale"
  | "calendar"
  | "banknote"
  | "wrench"
  | "message"
  | "badge";

export type ReportMeta = {
  key: string;
  title: string;
  description: string;
  group: ReportGroup;
  icon: ReportIcon;
  /** Financial reports need reports.financial in addition to reports.view. */
  financial: boolean;
  /** false = point-in-time ("as of today") report, the date filter is hidden. */
  usesDateRange: boolean;
  defaultPreset: Exclude<RangePreset, "custom">;
  dateLabel?: string;
  statusFilter?: { label: string; options: { value: string; label: string }[] };
};

export const REPORTS = [
  {
    key: "occupancy",
    title: "Occupancy",
    description: "Live occupancy by hostel, floor and room, with the monthly trend.",
    group: "occupancy",
    icon: "bed",
    financial: false,
    usesDateRange: true,
    defaultPreset: "last_12_months",
    dateLabel: "Trend period",
  },
  {
    key: "vacancy",
    title: "Vacancy",
    description: "Every available bed with its monthly rent and the revenue at stake.",
    group: "occupancy",
    icon: "door",
    financial: false,
    usesDateRange: false,
    defaultPreset: "this_month",
  },
  {
    key: "residents",
    title: "Residents",
    description: "Residents by status, and everyone who joined in the period.",
    group: "residents",
    icon: "users",
    financial: false,
    usesDateRange: true,
    defaultPreset: "last_12_months",
    dateLabel: "Joined",
    statusFilter: { label: "Status", options: optionsFrom(residentStatusLabels) },
  },
  {
    key: "check-ins",
    title: "Check-ins",
    description: "Bed assignments that started in the period, including transfers.",
    group: "residents",
    icon: "login",
    financial: false,
    usesDateRange: true,
    defaultPreset: "this_month",
  },
  {
    key: "check-outs",
    title: "Check-outs",
    description: "Residents who checked out, with stay length and deposit settlement.",
    group: "residents",
    icon: "logout",
    financial: false,
    usesDateRange: true,
    defaultPreset: "this_month",
  },
  {
    key: "rent-collection",
    title: "Rent collection",
    description: "Cash collected by period, payment method and hostel.",
    group: "finance",
    icon: "wallet",
    financial: true,
    usesDateRange: true,
    defaultPreset: "this_month",
  },
  {
    key: "outstanding",
    title: "Outstanding payments",
    description: "Unpaid balances per resident with 30/60/90-day aging.",
    group: "finance",
    icon: "alarm",
    financial: true,
    usesDateRange: false,
    defaultPreset: "this_month",
  },
  {
    key: "revenue",
    title: "Revenue",
    description: "Amounts billed by charge type, month and hostel.",
    group: "finance",
    icon: "trending",
    financial: true,
    usesDateRange: true,
    defaultPreset: "last_6_months",
  },
  {
    key: "expenses",
    title: "Expenses",
    description: "Spending by category, hostel and month.",
    group: "finance",
    icon: "receipt",
    financial: true,
    usesDateRange: true,
    defaultPreset: "last_6_months",
  },
  {
    key: "profit-loss",
    title: "Profit & loss",
    description: "Billed revenue, cash in, expenses, refunds, payroll and net result.",
    group: "finance",
    icon: "scale",
    financial: true,
    usesDateRange: true,
    defaultPreset: "last_6_months",
  },
  {
    key: "staff-attendance",
    title: "Staff attendance",
    description: "Attendance rate per staff member for the period.",
    group: "staff",
    icon: "calendar",
    financial: false,
    usesDateRange: true,
    defaultPreset: "this_month",
  },
  {
    key: "staff-payroll",
    title: "Staff payroll",
    description: "Monthly salary totals by status and per employee.",
    group: "staff",
    icon: "banknote",
    financial: true,
    usesDateRange: true,
    defaultPreset: "last_6_months",
    statusFilter: { label: "Status", options: optionsFrom(payrollStatusLabels) },
  },
  {
    key: "maintenance",
    title: "Maintenance",
    description: "Requests by status, category and priority with resolution time.",
    group: "operations",
    icon: "wrench",
    financial: false,
    usesDateRange: true,
    defaultPreset: "last_90_days",
    dateLabel: "Reported",
    statusFilter: { label: "Status", options: optionsFrom(maintenanceStatusLabels) },
  },
  {
    key: "complaints",
    title: "Complaints",
    description: "Complaints by status and category with resolution time.",
    group: "operations",
    icon: "message",
    financial: false,
    usesDateRange: true,
    defaultPreset: "last_90_days",
    dateLabel: "Submitted",
    statusFilter: { label: "Status", options: optionsFrom(complaintStatusLabels) },
  },
  {
    key: "visitors",
    title: "Visitors",
    description: "Visitor traffic per day and the full visitor log.",
    group: "operations",
    icon: "badge",
    financial: false,
    usesDateRange: true,
    defaultPreset: "last_30_days",
  },
] as const satisfies readonly ReportMeta[];

export type ReportKey = (typeof REPORTS)[number]["key"];

export function getReportMeta(key: string): ReportMeta | undefined {
  return (REPORTS as readonly ReportMeta[]).find((r) => r.key === key);
}

export function isReportKey(key: string): key is ReportKey {
  return REPORTS.some((r) => r.key === key);
}

export function reportPermissions(meta: Pick<ReportMeta, "financial">): Permission[] {
  return meta.financial ? ["reports.view", "reports.financial"] : ["reports.view"];
}

export function canViewReport(permissions: ReadonlySet<string> | readonly string[], meta: Pick<ReportMeta, "financial">) {
  const has = (p: string) => (permissions instanceof Set ? permissions.has(p) : (permissions as readonly string[]).includes(p));
  return reportPermissions(meta).every(has);
}
