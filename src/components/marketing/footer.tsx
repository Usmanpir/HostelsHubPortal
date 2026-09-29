import Link from "next/link";
import { APP_NAME } from "@/config/defaults";
import { BrandLogo } from "./brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#properties", label: "Multi-property" },
      { href: "/#leases", label: "Rentals & leases" },
      { href: "/#owners", label: "Owner payouts" },
      { href: "/#crm", label: "Dealer CRM" },
      { href: "/#listings", label: "Public listings" },
      { href: "/#billing", label: "Billing" },
      { href: "/#resident-portal", label: "Resident portal" },
      { href: "/#pricing", label: "Pricing" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/register", label: "Start free trial" },
      { href: "/login", label: "Sign in" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#contact", label: "Book a demo" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/#faq", label: "FAQ" },
      { href: "/#contact", label: "Contact us" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t bg-muted/20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <BrandLogo />
          <p className="mt-4 text-sm text-pretty text-muted-foreground">
            Property management software for hostels, rentals and real estate — beds and leases, billing, owner payouts,
            a dealer CRM and public listings in one place.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold">{col.title}</h2>
            <ul className="mt-4 grid gap-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
          <p>Made for hostel operators, landlords, property managers and real-estate dealers.</p>
        </div>
      </div>
    </footer>
  );
}
