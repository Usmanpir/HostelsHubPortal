import type { Permission } from "@/lib/permissions/catalog";

export type SettingsSectionKey =
  | "organization"
  | "branding"
  | "invoices"
  | "notifications"
  | "hostels"
  | "roles"
  | "members"
  | "billing"
  | "security";

export type SettingsSection = {
  key: SettingsSectionKey;
  href: string;
  label: string;
  description: string;
  /** `null` = every member may open it. */
  permission: Permission | null;
};

/** Settings sub-navigation, in display order. Filtered by the member's permissions. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: "organization",
    href: "/settings/organization",
    label: "Organization",
    description: "Name, contact details, logo, currency and time zone.",
    permission: "settings.organization",
  },
  {
    key: "branding",
    href: "/settings/branding",
    label: "Branding",
    description: "White-label name, colour, domain and email sender.",
    permission: "settings.organization",
  },
  {
    key: "invoices",
    href: "/settings/invoices",
    label: "Invoices",
    description: "Numbering, due dates, tax and invoice footer.",
    permission: "settings.organization",
  },
  {
    key: "notifications",
    href: "/settings/notifications",
    label: "Notifications",
    description: "Which events notify your team and residents.",
    permission: "settings.organization",
  },
  {
    key: "hostels",
    href: "/settings/hostels",
    label: "Hostel settings",
    description: "Rent defaults, rules and details for each hostel.",
    permission: "hostels.manage",
  },
  {
    key: "roles",
    href: "/settings/roles",
    label: "Roles & permissions",
    description: "Control what each role can see and do.",
    permission: "settings.roles",
  },
  {
    key: "members",
    href: "/settings/members",
    label: "Team members",
    description: "Invite teammates and manage their access.",
    permission: "settings.members",
  },
  {
    key: "billing",
    href: "/settings/billing",
    label: "Subscription",
    description: "Plan, usage and billing.",
    permission: "settings.billing",
  },
  {
    key: "security",
    href: "/settings/security",
    label: "Security",
    description: "Sessions and recent sign-ins.",
    permission: null,
  },
];

export function allowedSettingsSections(permissions: Iterable<string>): SettingsSection[] {
  const granted = new Set(permissions);
  return SETTINGS_SECTIONS.filter((s) => s.permission === null || granted.has(s.permission));
}
