import { ALL_PERMISSIONS, type Permission } from "./catalog";

/**
 * Default role templates. They are copied into each organization as editable
 * system roles when the organization is created — nothing at runtime checks a
 * role key; authorization is always done on permission keys.
 */
export type RoleTemplate = {
  key: string;
  name: string;
  description: string;
  defaultAllHostels: boolean;
  permissions: Permission[];
};

const without = (...excluded: Permission[]) =>
  ALL_PERMISSIONS.filter((p) => !excluded.includes(p));

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: "OWNER",
    name: "Owner",
    description: "Full access to everything in the organization.",
    defaultAllHostels: true,
    // "My tasks" is the staff work queue; owners use the dashboard instead.
    permissions: without("tasks.view"),
  },
  {
    key: "ADMIN",
    name: "Admin",
    description: "Manages hostels, residents, staff, finance, reports and settings.",
    defaultAllHostels: true,
    permissions: without("settings.billing", "tasks.view"),
  },
  {
    key: "ACCOUNTANT",
    name: "Accountant",
    description: "Invoices, payments, expenses, payroll and financial reports.",
    defaultAllHostels: true,
    permissions: [
      "dashboard.view",
      "hostels.view",
      "invoices.view",
      "invoices.manage",
      "payments.view",
      "payments.manage",
      "expenses.view",
      "expenses.manage",
      "payroll.view",
      "payroll.manage",
      "staff.view",
      "reports.view",
      "reports.financial",
      "owners.view",
      "deals.view",
    ],
  },
  {
    key: "HOSTEL_MANAGER",
    name: "Hostel Manager",
    description: "Runs day-to-day operations of assigned hostels.",
    defaultAllHostels: false,
    permissions: [
      "dashboard.view",
      "hostels.view",
      "rooms.view",
      "rooms.manage",
      "residents.view",
      "residents.manage",
      "residents.documents",
      "assignments.manage",
      "requests.view",
      "requests.manage",
      "staff.view",
      "attendance.view",
      "attendance.manage",
      "leave.view",
      "invoices.view",
      "payments.view",
      "maintenance.view",
      "maintenance.manage",
      "complaints.view",
      "complaints.manage",
      "visitors.view",
      "visitors.manage",
      "announcements.view",
      "announcements.manage",
      "reports.view",
    ],
  },
  {
    key: "RECEPTIONIST",
    name: "Receptionist",
    description: "Check-ins, check-outs, residents, visitors and room allocation.",
    defaultAllHostels: false,
    permissions: [
      "dashboard.view",
      "hostels.view",
      "rooms.view",
      "residents.view",
      "residents.manage",
      "residents.documents",
      "assignments.manage",
      "visitors.view",
      "visitors.manage",
      "announcements.view",
      "requests.view",
    ],
  },
  {
    key: "WARDEN",
    name: "Warden",
    description: "Resident welfare, complaints, maintenance, attendance and notices.",
    defaultAllHostels: false,
    permissions: [
      "dashboard.view",
      "hostels.view",
      "rooms.view",
      "residents.view",
      "complaints.view",
      "complaints.manage",
      "maintenance.view",
      "maintenance.manage",
      "attendance.view",
      "attendance.manage",
      "announcements.view",
      "announcements.manage",
      "visitors.view",
      "requests.view",
      "requests.manage",
    ],
  },
  {
    key: "AGENT",
    name: "Agent",
    description: "Property dealer agent: listings, leads, viewings and deals.",
    defaultAllHostels: true,
    permissions: [
      "dashboard.view",
      "hostels.view",
      "rooms.view",
      "listings.view",
      "listings.manage",
      "leads.view",
      "leads.manage",
      "deals.view",
      "announcements.view",
    ],
  },
  {
    key: "STAFF",
    name: "Staff",
    description: "Sees assigned tasks, own attendance and assigned maintenance.",
    defaultAllHostels: false,
    permissions: ["tasks.view", "maintenance.work", "announcements.view"],
  },
];

export const OWNER_ROLE_KEY = "OWNER";

export function getRoleTemplate(key: string) {
  return ROLE_TEMPLATES.find((r) => r.key === key);
}
