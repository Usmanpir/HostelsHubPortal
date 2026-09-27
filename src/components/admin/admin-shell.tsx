"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeftRight,
  Building2,
  CreditCard,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { signOutAction } from "@/app/(app)/shell-actions";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/plans", label: "Plans", icon: Package },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/feature-flags", label: "Feature flags", icon: Flag },
  { href: "/admin/settings", label: "System settings", icon: Settings2 },
  { href: "/admin/audit-log", label: "Audit log", icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

function Brand() {
  return (
    <Link href="/admin" className="flex h-9 items-center gap-2.5 px-2">
      <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
        <ShieldCheck className="size-4" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">Platform admin</span>
        <span className="text-[11px] text-muted-foreground">Super admin console</span>
      </span>
    </Link>
  );
}

function Nav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Admin">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  children,
  user,
  hasWorkspace,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
  /** The admin also belongs to an organization, so offer a way back. */
  hasWorkspace: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [signingOut, startSignOut] = useTransition();
  const current = NAV.find((n) => isActive(pathname, n.href));

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-2">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <Nav pathname={pathname} />
        </div>
        {hasWorkspace ? (
          <div className="border-t p-2">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <Link href="/dashboard">
                <ArrowLeftRight />
                Back to workspace
              </Link>
            </Button>
          </div>
        ) : null}
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetHeader className="border-b p-3">
            <SheetTitle asChild>
              <div>
                <Brand />
              </div>
            </SheetTitle>
            <SheetDescription className="sr-only">Admin navigation</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 overflow-y-auto p-3">
            <Nav pathname={pathname} onNavigate={() => setOpen(false)} />
            {hasWorkspace ? (
              <Button asChild variant="outline" size="sm" className="justify-start">
                <Link href="/dashboard" onClick={() => setOpen(false)}>
                  <ArrowLeftRight />
                  Back to workspace
                </Link>
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <span className="truncate text-sm font-medium md:hidden">{current?.label ?? "Admin"}</span>
          <span className="hidden items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground md:inline-flex">
            <ShieldCheck className="size-3.5" />
            Metadata only — tenant data is private
          </span>
          <div className="ms-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-foreground/10 text-xs font-semibold">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate">{user.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                  <span className="mt-1 text-xs font-normal text-muted-foreground">Super admin</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hasWorkspace ? (
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard">
                      <ArrowLeftRight />
                      Back to workspace
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />}
                    Theme
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => setTheme("light")}>
                      <Sun /> Light
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTheme("dark")}>
                      <Moon /> Dark
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTheme("system")}>
                      <Monitor /> System
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={signingOut} onSelect={() => startSignOut(() => signOutAction())}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
