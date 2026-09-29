/**
 * Permission catalog. Keys are checked by server code; the Role/RolePermission
 * tables record which keys each organization role has been granted.
 */
export const PERMISSION_GROUPS = [
  {
    key: "general",
    label: "General",
    permissions: [
      { key: "dashboard.view", label: "View dashboard" },
      { key: "tasks.view", label: "View own assigned tasks" },
      { key: "reports.view", label: "View operational reports" },
      { key: "reports.financial", label: "View financial reports" },
      { key: "audit.view", label: "View audit log" },
    ],
  },
  {
    key: "property",
    label: "Hostels & rooms",
    permissions: [
      { key: "hostels.view", label: "View hostels" },
      { key: "hostels.manage", label: "Create, edit and archive hostels" },
      { key: "rooms.view", label: "View floors, rooms and beds" },
      { key: "rooms.manage", label: "Manage floors, rooms and beds" },
    ],
  },
  {
    key: "residents",
    label: "Residents",
    permissions: [
      { key: "residents.view", label: "View residents" },
      { key: "residents.manage", label: "Create and edit residents" },
      { key: "residents.documents", label: "View and upload resident documents" },
      { key: "assignments.manage", label: "Check-in, check-out and transfers" },
      { key: "requests.view", label: "View resident requests" },
      { key: "requests.manage", label: "Approve or reject resident requests" },
    ],
  },
  {
    key: "staff",
    label: "Staff",
    permissions: [
      { key: "staff.view", label: "View staff" },
      { key: "staff.manage", label: "Manage staff records" },
      { key: "attendance.view", label: "View attendance" },
      { key: "attendance.manage", label: "Mark attendance" },
      { key: "leave.view", label: "View leave" },
      { key: "leave.manage", label: "Approve leave" },
      { key: "payroll.view", label: "View payroll" },
      { key: "payroll.manage", label: "Generate and pay salaries" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    permissions: [
      { key: "invoices.view", label: "View invoices" },
      { key: "invoices.manage", label: "Create and cancel invoices" },
      { key: "payments.view", label: "View payments" },
      { key: "payments.manage", label: "Record and void payments" },
      { key: "expenses.view", label: "View expenses" },
      { key: "expenses.manage", label: "Record and void expenses" },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    permissions: [
      { key: "maintenance.view", label: "View maintenance requests" },
      { key: "maintenance.manage", label: "Manage maintenance requests" },
      { key: "maintenance.work", label: "Update maintenance assigned to me" },
      { key: "complaints.view", label: "View complaints" },
      { key: "complaints.manage", label: "Manage complaints" },
      { key: "visitors.view", label: "View visitor log" },
      { key: "visitors.manage", label: "Check visitors in and out" },
      { key: "announcements.view", label: "View announcements" },
      { key: "announcements.manage", label: "Publish announcements" },
    ],
  },
  {
    key: "owners",
    label: "Owners",
    permissions: [
      { key: "owners.view", label: "View property owners and statements" },
      { key: "owners.manage", label: "Manage owners and record owner payouts" },
    ],
  },
  {
    key: "realEstate",
    label: "Sales & leasing",
    permissions: [
      { key: "listings.view", label: "View listings" },
      { key: "listings.manage", label: "Create, edit and publish listings" },
      { key: "leads.view", label: "View leads and viewings" },
      { key: "leads.manage", label: "Manage leads and schedule viewings" },
      { key: "deals.view", label: "View deals and commissions" },
      { key: "deals.manage", label: "Manage deals and commissions" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    permissions: [
      { key: "settings.organization", label: "Edit organization settings" },
      { key: "settings.members", label: "Invite and manage team members" },
      { key: "settings.roles", label: "Manage roles and permissions" },
      { key: "settings.billing", label: "Manage subscription and billing" },
    ],
  },
] as const;

type Groups = typeof PERMISSION_GROUPS;
export type Permission = Groups[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}
