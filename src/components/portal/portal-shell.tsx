"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BedDouble,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareWarning,
  Moon,
  Send,
  Sun,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/layout/notification-center";
import { signOutAction } from "@/app/(app)/shell-actions";
import { cn } from "@/lib/utils";
import { PortalUserMenu } from "./portal-user-menu";

type NavItem = { href: string; label: string; icon: LucideIcon };

const PRIMARY: NavItem[] = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/invoices", label: "Invoices", icon: FileText },
  { href: "/portal/requests", label: "Requests", icon: Send },
  { href: "/portal/announcements", label: "Notices", icon: Megaphone },
];

const MORE: NavItem[] = [
  { href: "/portal/room", label: "My room", icon: BedDouble },
  { href: "/portal/payments", label: "Payments", icon: CreditCard },
  { href: "/portal/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/portal/complaints", label: "Complaints", icon: MessageSquareWarning },
  { href: "/portal/profile", label: "Profile", icon: User },
];

const DESKTOP: NavItem[] = [PRIMARY[0]!, MORE[0]!, PRIMARY[1]!, MORE[1]!, MORE[2]!, MORE[3]!, PRIMARY[2]!, PRIMARY[3]!];

function isActive(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal";
  return pathname === href || pathname.startsWith(href + "/");
}

export type PortalShellProps = {
  children: React.ReactNode;
  brand: { name: string; logoUrl: string | null; hostelName: string };
  user: { name: string; email: string; residentCode: string };
};

export function PortalShell({ children, brand, user }: PortalShellProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [signingOut, startSignOut] = useTransition();

  const moreActive = MORE.some((i) => isActive(pathname, i.href));

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="no-print sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-2.5">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file route
              <img src={brand.logoUrl} alt="" className="size-8 rounded-lg object-cover" />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                {brand.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{brand.name}</span>
              <span className="truncate text-xs text-muted-foreground">{brand.hostelName}</span>
            </span>
          </Link>
          <nav className="ms-4 hidden items-center gap-0.5 lg:flex" aria-label="Portal">
            {DESKTOP.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive(pathname, item.href) && "bg-muted text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <NotificationCenter />
            <PortalUserMenu name={user.name} email={user.email} residentCode={user.residentCode} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-28 sm:px-6 sm:py-6 lg:pb-10">{children}</main>

      {/* Mobile / tablet bottom navigation */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Portal"
      >
        {PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground",
                active && "text-primary",
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground", moreActive && "text-primary")}
        >
          <Menu className="size-5" />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="pb-0">
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">More portal sections</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4">
            {MORE.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border bg-card px-2 py-4 text-center text-xs font-medium transition-colors active:bg-accent",
                    active && "border-primary/40 bg-primary/5 text-primary",
                  )}
                >
                  <item.icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="flex flex-col items-center gap-2 rounded-xl border bg-card px-2 py-4 text-xs font-medium active:bg-accent"
            >
              {resolvedTheme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
          <div className="px-4">
            <Button
              variant="outline"
              className="w-full"
              disabled={signingOut}
              onClick={() => startSignOut(() => signOutAction())}
            >
              <LogOut />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
