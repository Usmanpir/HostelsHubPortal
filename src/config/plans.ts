/**
 * Default SaaS plans, seeded into the Plan table. Limits of `null` mean
 * unlimited. Prices are placeholders to be set by the platform operator.
 */
export type PlanLimits = {
  maxHostels: number | null;
  maxBeds: number | null;
  maxResidents: number | null;
  maxStaff: number | null;
  maxStorageMb: number | null;
};

export const PLAN_FEATURES = {
  advancedReports: "reports.advanced",
  exports: "reports.export",
  customBranding: "branding.custom",
  emailNotifications: "notifications.email",
  residentPortal: "portal.resident",
  customRoles: "roles.custom",
} as const;

export type PlanFeature = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];

export type PlanDefinition = {
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeature[];
  sortOrder: number;
};

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    key: "trial",
    name: "Free Trial",
    description: "Everything in Business for 14 days.",
    priceMonthly: 0,
    priceYearly: 0,
    currency: "USD",
    trialDays: 14,
    limits: { maxHostels: 3, maxBeds: 300, maxResidents: 300, maxStaff: 30, maxStorageMb: 1024 },
    features: ["reports.advanced", "reports.export", "notifications.email", "portal.resident", "roles.custom"],
    sortOrder: 0,
  },
  {
    key: "starter",
    name: "Starter",
    description: "For a single hostel getting organised.",
    priceMonthly: 19,
    priceYearly: 190,
    currency: "USD",
    trialDays: 14,
    limits: { maxHostels: 1, maxBeds: 60, maxResidents: 80, maxStaff: 10, maxStorageMb: 1024 },
    features: ["reports.export", "portal.resident"],
    sortOrder: 1,
  },
  {
    key: "business",
    name: "Business",
    description: "For growing operators with several properties.",
    priceMonthly: 59,
    priceYearly: 590,
    currency: "USD",
    trialDays: 14,
    limits: { maxHostels: 10, maxBeds: 1000, maxResidents: 1200, maxStaff: 100, maxStorageMb: 10240 },
    features: ["reports.advanced", "reports.export", "notifications.email", "portal.resident", "roles.custom"],
    sortOrder: 2,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    description: "Unlimited properties, custom branding and priority support.",
    priceMonthly: 199,
    priceYearly: 1990,
    currency: "USD",
    trialDays: 30,
    limits: { maxHostels: null, maxBeds: null, maxResidents: null, maxStaff: null, maxStorageMb: null },
    features: [
      "reports.advanced",
      "reports.export",
      "branding.custom",
      "notifications.email",
      "portal.resident",
      "roles.custom",
    ],
    sortOrder: 3,
  },
];

export const TRIAL_PLAN_KEY = "trial";
