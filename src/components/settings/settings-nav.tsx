"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Bell, Blocks, Building, Building2, CreditCard, FileText, Palette, ShieldCheck, UserCog, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SettingsSectionKey } from "./sections";

const ICONS: Record<SettingsSectionKey, LucideIcon> = {
  organization: Building,
  business: Blocks,
  branding: Palette,
  invoices: FileText,
  notifications: Bell,
  payments: Wallet,
  hostels: Building2,
  roles: UserCog,
  members: Users,
  billing: CreditCard,
  security: ShieldCheck,
};

export function SettingsNav({ sections }: { sections: { key: SettingsSectionKey; href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-4 lg:mx-0">
      <ul className="flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:sticky lg:top-20 lg:flex-col lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const Icon = ICONS[s.key];
          const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
          return (
            <li key={s.key} className="shrink-0">
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  "border lg:border-transparent",
                  active
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
