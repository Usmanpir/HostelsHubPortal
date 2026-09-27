"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { NavSection } from "@/config/navigation";
import type { Messages } from "@/lib/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";

/** Most specific matching leaf wins so /hostels and /hostels/rooms don't both light up. */
function activeLeaf(pathname: string, sections: NavSection[]) {
  const hrefs = sections.flatMap((s) => (s.items ? s.items.map((i) => i.href) : s.href ? [s.href] : []));
  const matches = hrefs.filter((h) => pathname === h || pathname.startsWith(h + "/"));
  return matches.sort((a, b) => b.length - a.length)[0];
}

export function SidebarNav({
  sections,
  labels,
  collapsed = false,
  onNavigate,
}: {
  sections: NavSection[];
  labels: Messages["nav"];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const current = activeLeaf(pathname, sections);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.filter((s) => s.items).map((s) => [s.label, true])),
  );

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {sections.map((section) => {
        const Icon = NAV_ICONS[section.icon];
        if (!section.items) {
          const active = current === section.href;
          const link = (
            <Link
              key={section.label}
              href={section.href!}
              onClick={onNavigate}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              {!collapsed ? <span className="truncate">{labels[section.label]}</span> : null}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={section.label}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{labels[section.label]}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        }

        const sectionActive = section.items.some((i) => i.href === current);
        if (collapsed) {
          const first = section.items[0]!;
          return (
            <Tooltip key={section.label}>
              <TooltipTrigger asChild>
                <Link
                  href={first.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent",
                    sectionActive && "bg-sidebar-accent",
                  )}
                >
                  <Icon className={cn("size-4", sectionActive ? "text-primary" : "text-muted-foreground")} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{labels[section.label]}</TooltipContent>
            </Tooltip>
          );
        }

        const isOpen = open[section.label] ?? true;
        return (
          <div key={section.label} className="flex flex-col">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [section.label]: !isOpen }))}
              className="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-expanded={isOpen}
            >
              <Icon className={cn("size-4 shrink-0", sectionActive ? "text-primary" : "text-muted-foreground")} />
              <span className="flex-1 truncate text-start">{labels[section.label]}</span>
              <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !isOpen && "-rotate-90 rtl:rotate-90")} />
            </button>
            {isOpen ? (
              <div className="ms-4 flex flex-col gap-0.5 border-s ps-2.5 py-0.5">
                {section.items.map((item) => {
                  const active = item.href === current;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex h-7 items-center rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                      )}
                    >
                      {labels[item.label]}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
