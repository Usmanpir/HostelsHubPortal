export const DEFAULT_EXPENSE_CATEGORIES = [
  { key: "electricity", name: "Electricity" },
  { key: "gas", name: "Gas" },
  { key: "water", name: "Water" },
  { key: "internet", name: "Internet" },
  { key: "maintenance", name: "Maintenance" },
  { key: "salaries", name: "Salaries" },
  { key: "food", name: "Food" },
  { key: "cleaning", name: "Cleaning" },
  { key: "security", name: "Security" },
  { key: "supplies", name: "Supplies" },
  { key: "rent", name: "Rent" },
  { key: "other", name: "Other" },
] as const;

export const CURRENCIES = [
  { code: "PKR", label: "Pakistani Rupee (PKR)" },
  { code: "USD", label: "US Dollar (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "AED", label: "UAE Dirham (AED)" },
  { code: "SAR", label: "Saudi Riyal (SAR)" },
  { code: "INR", label: "Indian Rupee (INR)" },
  { code: "BDT", label: "Bangladeshi Taka (BDT)" },
  { code: "MYR", label: "Malaysian Ringgit (MYR)" },
  { code: "TRY", label: "Turkish Lira (TRY)" },
  { code: "CAD", label: "Canadian Dollar (CAD)" },
  { code: "AUD", label: "Australian Dollar (AUD)" },
] as const;

export const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Istanbul",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "UTC",
] as const;

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "HostelHub";
