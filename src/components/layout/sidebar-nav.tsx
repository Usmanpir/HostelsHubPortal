"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { NavSection } from "@/config/navigation";
import type { Messages } from "@/lib/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";

type Target = { key: string; section: string; prefixes: string[] };

function targets(sections: NavSection[]): Target[] {
  return sections.flatMap((s) =>
    s.items
      ? s.items.map((i) => ({ key: i.href, section: s.label, prefixes: i.match }))
      : s.href
        ? [{ key: s.href, section: s.label, prefixes: [s.href, ...(s.match ?? [])] }]
        : [],
  );
}

/**
 * Most specific matching route prefix wins, so /hostels and /hostels/rooms don't both light up
 * and every tab of a grouped page (e.g. /hostels/beds) highlights its shared entry.
 */
function activeTarget(pathname: string, sections: NavSection[]): Target | undefined {
  let best: { target: Target; length: number } | undefined;
  for (const target of targets(sections)) {
    for (const prefix of target.prefixes) {
      if ((pathname === prefix || pathname.startsWith(prefix + "/")) && (!best || prefix.length > best.length)) {
        best = { target, length: prefix.length };
      }
    }
  }
  return best?.target;
}

const rowBase =
  "flex items-center gap-3 rounded-lg text-sm font-medium text-sidebar-foreground/80 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring";

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
  const baseId = useId();
  const current = activeTarget(pathname, sections);
  const currentSection = current?.section ?? null;

  // Accordion: only the section holding the current page starts open. Re-sync when navigation
  // lands in a different section (adjusting state during render, not in an effect).
  const [open, setOpen] = useState<string | null>(currentSection);
  const [syncedSection, setSyncedSection] = useState(currentSection);
  if (syncedSection !== currentSection) {
    setSyncedSection(currentSection);
    setOpen(currentSection);
  }

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {sections.map((section) => {
        const Icon = NAV_ICONS[section.icon];
        const label = labels[section.label];
        if (!section.items) {
          const active = current?.key === section.href;
          const link = (
            <Link
              key={section.label}
              href={section.href!}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(rowBase, "h-9 px-2.5", active && "bg-sidebar-accent text-sidebar-accent-foreground", collapsed && "justify-center px-0")}
            >
              <Icon className={cn("size-4.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
              {!collapsed ? <span className="truncate">{label}</span> : null}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={section.label}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        }

        const sectionActive = currentSection === section.label;
        if (collapsed) {
          const target = section.items.find((i) => i.href === current?.key) ?? section.items[0]!;
          return (
            <Tooltip key={section.label}>
              <TooltipTrigger asChild>
                <Link
                  href={target.href}
                  onClick={onNavigate}
                  aria-label={label}
                  aria-current={sectionActive && target.href === current?.key ? "page" : undefined}
                  className={cn(rowBase, "h-9 justify-center", sectionActive && "bg-sidebar-accent")}
                >
                  <Icon className={cn("size-4.5", sectionActive ? "text-primary" : "text-muted-foreground")} aria-hidden />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        }

        const isOpen = open === section.label;
        const panelId = `${baseId}-${section.label}`;
        return (
          <div key={section.label} className="flex flex-col">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : section.label)}
              className={cn(rowBase, "h-9 px-2.5", sectionActive && !isOpen && "text-sidebar-accent-foreground")}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <Icon className={cn("size-4.5 shrink-0", sectionActive ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="flex-1 truncate text-start">{label}</span>
              <ChevronDown
                className={cn("size-4 text-muted-foreground transition-transform duration-200", !isOpen && "-rotate-90 rtl:rotate-90")}
                aria-hidden
              />
            </button>
            {isOpen ? (
              <ul id={panelId} className="ms-4.75 mt-0.5 mb-1 flex flex-col gap-0.5 border-s ps-3">
                {section.items.map((item) => {
                  const active = item.href === current?.key;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          rowBase,
                          "h-8 px-2.5 font-normal text-muted-foreground",
                          active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                        )}
                      >
                        <span className="truncate">{labels[item.label]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
