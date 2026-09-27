import type { Permission } from "@/lib/permissions/catalog";
import type { Messages } from "@/lib/i18n";

export type NavIcon =
  | "dashboard"
  | "tasks"
  | "hostels"
  | "residents"
  | "staff"
  | "finance"
  | "operations"
  | "reports"
  | "settings"
  | "audit";

export type NavLeaf = {
  label: keyof Messages["nav"];
  href: string;
  permission: Permission;
};

export type NavSection = {
  label: keyof Messages["nav"];
  icon: NavIcon;
  href?: string;
  /** Visible if the user has any of these (for leafless sections) */
  permission?: Permission;
  items?: NavLeaf[];
};

/** Sidebar structure. Items are filtered by the member's permissions. */
export const NAVIGATION: NavSection[] = [
  { label: "dashboard", icon: "dashboard", href: "/dashboard", permission: "dashboard.view" },
  { label: "myTasks", icon: "tasks", href: "/tasks", permission: "tasks.view" },
  {
    label: "hostels",
    icon: "hostels",
    items: [
      { label: "allHostels", href: "/hostels", permission: "hostels.view" },
      { label: "roomMap", href: "/hostels/map", permission: "rooms.view" },
      { label: "floors", href: "/hostels/floors", permission: "rooms.view" },
      { label: "rooms", href: "/hostels/rooms", permission: "rooms.view" },
      { label: "beds", href: "/hostels/beds", permission: "rooms.view" },
    ],
  },
  {
    label: "residents",
    icon: "residents",
    items: [
      { label: "allResidents", href: "/residents", permission: "residents.view" },
      { label: "checkIns", href: "/residents/check-in", permission: "assignments.manage" },
      { label: "checkOuts", href: "/residents/check-out", permission: "assignments.manage" },
      { label: "assignments", href: "/residents/assignments", permission: "residents.view" },
      { label: "requests", href: "/residents/requests", permission: "requests.view" },
    ],
  },
  {
    label: "staff",
    icon: "staff",
    items: [
      { label: "allStaff", href: "/staff", permission: "staff.view" },
      { label: "attendance", href: "/staff/attendance", permission: "attendance.view" },
      { label: "leave", href: "/staff/leave", permission: "leave.view" },
      { label: "payroll", href: "/staff/payroll", permission: "payroll.view" },
    ],
  },
  {
    label: "finance",
    icon: "finance",
    items: [
      { label: "financeOverview", href: "/finance", permission: "reports.financial" },
      { label: "invoices", href: "/finance/invoices", permission: "invoices.view" },
      { label: "payments", href: "/finance/payments", permission: "payments.view" },
      { label: "expenses", href: "/finance/expenses", permission: "expenses.view" },
    ],
  },
  {
    label: "operations",
    icon: "operations",
    items: [
      { label: "maintenance", href: "/operations/maintenance", permission: "maintenance.view" },
      { label: "complaints", href: "/operations/complaints", permission: "complaints.view" },
      { label: "visitors", href: "/operations/visitors", permission: "visitors.view" },
      { label: "announcements", href: "/operations/announcements", permission: "announcements.view" },
    ],
  },
  { label: "reports", icon: "reports", href: "/reports", permission: "reports.view" },
  { label: "auditLog", icon: "audit", href: "/audit-log", permission: "audit.view" },
  { label: "settings", icon: "settings", href: "/settings" },
];

export function filterNavigation(permissions: ReadonlySet<string>): NavSection[] {
  return NAVIGATION.flatMap((section) => {
    if (section.items) {
      const items = section.items.filter((i) => permissions.has(i.permission));
      return items.length ? [{ ...section, items }] : [];
    }
    if (section.permission && !permissions.has(section.permission)) return [];
    return [section];
  });
}
