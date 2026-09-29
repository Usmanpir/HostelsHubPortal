"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, Home, Menu, PanelLeftClose, PanelLeftOpen, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { NavSection } from "@/config/navigation";
import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";
import { HostelSwitcher, type HostelOption } from "./hostel-switcher";
import { GlobalSearch } from "./global-search";
import { NotificationCenter } from "./notification-center";
import { UserMenu } from "./user-menu";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

export type ShellProps = {
  children: React.ReactNode;
  nav: NavSection[];
  messages: Messages;
  brand: { name: string; logoUrl: string | null };
  user: { name: string; email: string; roleName: string };
  hostels: HostelOption[];
  activeHostelId: string | null;
  allowAllHostels: boolean;
  organizations: { id: string; name: string }[];
  activeOrganizationId: string;
  permissions: string[];
  banner?: React.ReactNode;
  assistantEnabled: boolean;
};

function Brand({ brand, collapsed }: { brand: ShellProps["brand"]; collapsed?: boolean }) {
  return (
    <Link href="/dashboard" className={cn("flex h-9 items-center gap-2.5 px-2", collapsed && "justify-center px-0")}>
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file route
        <img src={brand.logoUrl} alt="" className="size-7 rounded-md object-cover" />
      ) : (
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          {brand.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {!collapsed ? <span className="truncate text-sm font-semibold">{brand.name}</span> : null}
    </Link>
  );
}

export function AppShell(props: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      // Restore a per-device preference from localStorage after mount (avoids hydration mismatch).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(window.localStorage.getItem("sidebar-collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  // Close the mobile drawer on navigation (adjust state during render).
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setMobileOpen(false);
  }

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const has = (p: string) => props.permissions.includes(p);
  const bottomNav = [
    { href: "/dashboard", label: "Home", icon: Home, show: has("dashboard.view") },
    { href: "/residents", label: "Residents", icon: Users, show: has("residents.view") },
    { href: "/hostels/map", label: "Beds", icon: BedDouble, show: has("rooms.view") },
    { href: "/finance/payments", label: "Payments", icon: Receipt, show: has("payments.view") },
  ].filter((i) => i.show);

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          "no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-e bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex h-14 items-center border-b px-3", collapsed ? "justify-center px-2" : "justify-between")}>
          <Brand brand={props.brand} collapsed={collapsed} />
        </div>
        <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          <SidebarNav sections={props.nav} labels={props.messages.nav} collapsed={collapsed} />
        </div>
        <div className={cn("border-t", collapsed ? "flex justify-center p-2" : "p-3")}>
          <Button variant="ghost" size="sm" onClick={toggleCollapsed} className={cn(!collapsed && "w-full justify-start")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="rtl:rotate-180" /> : <PanelLeftClose className="rtl:rotate-180" />}
            {!collapsed ? "Collapse" : null}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle asChild>
              <div>
                <Brand brand={props.brand} />
              </div>
            </SheetTitle>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto p-4">
            <HostelSwitcher
              hostels={props.hostels}
              activeHostelId={props.activeHostelId}
              allowAll={props.allowAllHostels}
              className="w-full max-w-none"
            />
            <SidebarNav sections={props.nav} labels={props.messages.nav} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <HostelSwitcher
            hostels={props.hostels}
            activeHostelId={props.activeHostelId}
            allowAll={props.allowAllHostels}
            className="hidden sm:inline-flex"
          />
          <div className="min-w-0 flex-1 sm:flex-none">
            <GlobalSearch placeholder={props.messages.common.searchPlaceholder} />
          </div>
          <div className="ms-auto flex items-center gap-1">
            <NotificationCenter />
            <UserMenu
              name={props.user.name}
              email={props.user.email}
              roleName={props.user.roleName}
              organizations={props.organizations}
              activeOrganizationId={props.activeOrganizationId}
            />
          </div>
        </header>
        {props.banner}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 pb-24 sm:px-6 sm:py-6 md:pb-8">{props.children}</main>
      </div>

      <AssistantPanel enabled={props.assistantEnabled} />

      {/* Mobile bottom navigation */}
      {bottomNav.length > 1 ? (
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${bottomNav.length + 1}, minmax(0, 1fr))` }}>
          {bottomNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground outline-none focus-visible:bg-accent", active && "text-primary")}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMobileOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground outline-none focus-visible:bg-accent">
            <Menu className="size-5" />
            More
          </button>
        </nav>
      ) : null}
    </div>
  );
}
