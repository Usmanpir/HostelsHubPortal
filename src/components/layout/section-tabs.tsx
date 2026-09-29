"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { allowedTabs, type TabGroupKey } from "@/config/navigation";
import { getMessages } from "@/lib/i18n";
import { useOrg } from "@/components/shared/org-context";
import { cn } from "@/lib/utils";

/**
 * Tab bar for pages that share one sidebar entry (e.g. Floors / Rooms / Beds).
 * Each tab is a real route; tabs the member can't open are hidden, and the bar
 * disappears when only one tab is left.
 */
export function SectionTabs({ group, className }: { group: TabGroupKey; className?: string }) {
  const pathname = usePathname();
  const { permissions, locale } = useOrg();
  const labels = getMessages(locale).nav;
  const tabs = useMemo(() => allowedTabs(group, new Set(permissions)), [group, permissions]);
  if (tabs.length < 2) return null;

  return (
    <nav aria-label={labels[group]} className={cn("no-print -mx-4 mb-5 border-b sm:mx-0", className)}>
      <ul className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none",
                  "focus-visible:rounded-t-md focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {labels[tab.label]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
