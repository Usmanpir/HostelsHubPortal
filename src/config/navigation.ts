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
  | "audit"
  | "owners"
  | "realEstate";

/** Optional product modules an organization can switch on (Settings → Modules). */
export type NavModules = { owners: boolean; dealer: boolean };

export type NavLabel = keyof Messages["nav"];

/** One route inside a tabbed page group ("Rooms & beds", "Check in / out", …). */
export type NavTab = {
  label: NavLabel;
  href: string;
  permission: Permission;
};

/**
 * Pages that share one sidebar entry and switch between each other with a tab bar
 * (`SectionTabs`). Order here is the tab order.
 */
export const TAB_GROUPS = {
  roomsAndBeds: [
    { label: "floors", href: "/hostels/floors", permission: "rooms.view" },
    { label: "rooms", href: "/hostels/rooms", permission: "rooms.view" },
    { label: "beds", href: "/hostels/beds", permission: "rooms.view" },
  ],
  checkInOut: [
    { label: "checkIn", href: "/residents/check-in", permission: "assignments.manage" },
    { label: "checkOut", href: "/residents/check-out", permission: "assignments.manage" },
    { label: "history", href: "/residents/assignments", permission: "residents.view" },
  ],
  attendanceLeave: [
    { label: "attendance", href: "/staff/attendance", permission: "attendance.view" },
    { label: "leave", href: "/staff/leave", permission: "leave.view" },
  ],
} as const satisfies Record<string, readonly NavTab[]>;

export type TabGroupKey = keyof typeof TAB_GROUPS;

export function allowedTabs(group: TabGroupKey, permissions: ReadonlySet<string>): NavTab[] {
  return TAB_GROUPS[group].filter((t) => permissions.has(t.permission));
}

type NavLeafDef = {
  label: NavLabel;
  /** Preferred landing route; falls back to the first permitted tab of `tabs`. */
  href: string;
  permission: Permission;
  tabs?: TabGroupKey;
};

type NavSectionDef = {
  label: NavLabel;
  icon: NavIcon;
  href?: string;
  /** Visible only with this permission (leafless sections). */
  permission?: Permission;
  /** Hidden when the member has this permission (used for fallbacks). */
  hiddenWith?: Permission;
  /** Extra route prefixes that highlight this entry. */
  match?: string[];
  /** Only shown when this module is enabled for the organization. */
  module?: keyof NavModules;
  items?: NavLeafDef[];
};

/** A resolved sidebar link: `match` lists every route prefix that highlights it. */
export type NavLeaf = { label: NavLabel; href: string; match: string[] };

export type NavSection = {
  label: NavLabel;
  icon: NavIcon;
  href?: string;
  match?: string[];
  items?: NavLeaf[];
};

/** Sidebar structure. Items are filtered by the member's permissions. */
const NAVIGATION: NavSectionDef[] = [
  { label: "dashboard", icon: "dashboard", href: "/dashboard", permission: "dashboard.view" },
  { label: "myTasks", icon: "tasks", href: "/tasks", permission: "tasks.view" },
  {
    label: "hostels",
    icon: "hostels",
    items: [
      { label: "allHostels", href: "/hostels", permission: "hostels.view" },
      { label: "roomMap", href: "/hostels/map", permission: "rooms.view" },
      { label: "roomsAndBeds", href: "/hostels/rooms", permission: "rooms.view", tabs: "roomsAndBeds" },
    ],
  },
  {
    label: "residents",
    icon: "residents",
    items: [
      { label: "allResidents", href: "/residents", permission: "residents.view" },
      { label: "checkInOut", href: "/residents/check-in", permission: "assignments.manage", tabs: "checkInOut" },
      { label: "requests", href: "/residents/requests", permission: "requests.view" },
    ],
  },
  {
    label: "staff",
    icon: "staff",
    items: [
      { label: "allStaff", href: "/staff", permission: "staff.view" },
      { label: "attendanceLeave", href: "/staff/attendance", permission: "attendance.view", tabs: "attendanceLeave" },
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
  {
    label: "owners",
    icon: "owners",
    module: "owners",
    items: [
      { label: "allOwners", href: "/owners", permission: "owners.view" },
      { label: "ownerPayouts", href: "/owners/payouts", permission: "owners.view" },
    ],
  },
  {
    label: "realEstate",
    icon: "realEstate",
    module: "dealer",
    items: [
      { label: "listings", href: "/listings", permission: "listings.view" },
      { label: "leads", href: "/leads", permission: "leads.view" },
      { label: "viewings", href: "/leads/viewings", permission: "leads.view" },
      { label: "deals", href: "/deals", permission: "deals.view" },
    ],
  },
  // The audit log is linked from the Reports hub; members who can audit but not see reports get it directly.
  { label: "reports", icon: "reports", href: "/reports", permission: "reports.view", match: ["/audit-log"] },
  { label: "auditLog", icon: "audit", href: "/audit-log", permission: "audit.view", hiddenWith: "reports.view" },
  { label: "settings", icon: "settings", href: "/settings" },
];

function resolveLeaf(leaf: NavLeafDef, permissions: ReadonlySet<string>): NavLeaf | null {
  const tabs = leaf.tabs ? allowedTabs(leaf.tabs, permissions) : [];
  const href = permissions.has(leaf.permission) ? leaf.href : tabs[0]?.href;
  if (!href) return null;
  return { label: leaf.label, href, match: [...new Set([href, ...tabs.map((t) => t.href)])] };
}

export function filterNavigation(
  permissions: ReadonlySet<string>,
  modules: NavModules = { owners: false, dealer: false },
): NavSection[] {
  return NAVIGATION.flatMap((section): NavSection[] => {
    if (section.module && !modules[section.module]) return [];
    if (section.items) {
      const items = section.items.map((i) => resolveLeaf(i, permissions)).filter((i): i is NavLeaf => i !== null);
      return items.length ? [{ label: section.label, icon: section.icon, items }] : [];
    }
    if (section.permission && !permissions.has(section.permission)) return [];
    if (section.hiddenWith && permissions.has(section.hiddenWith)) return [];
    return [{ label: section.label, icon: section.icon, href: section.href, match: section.match }];
  });
}
