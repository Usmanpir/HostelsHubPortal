import Link from "next/link";
import { ChevronDown, CreditCard, LogIn, LogOut, MessageSquarePlus, UserRoundPlus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Permission } from "@/lib/permissions/catalog";

type Action = { label: string; href: string; permission: Permission; icon: typeof LogIn };

/** Always-visible shortcuts (at most three). */
const PRIMARY: Action[] = [
  { label: "Check in", href: "/residents/check-in", permission: "assignments.manage", icon: LogIn },
  { label: "Record payment", href: "/finance/payments/new", permission: "payments.manage", icon: CreditCard },
  { label: "Add visitor", href: "/operations/visitors", permission: "visitors.manage", icon: UserRoundPlus },
];

/** Tucked into the "More" menu. */
const SECONDARY: Action[] = [
  { label: "Check out", href: "/residents/check-out", permission: "assignments.manage", icon: LogOut },
  { label: "New complaint", href: "/operations/complaints?new=1", permission: "complaints.manage", icon: MessageSquarePlus },
  { label: "New maintenance request", href: "/operations/maintenance?new=1", permission: "maintenance.manage", icon: Wrench },
];

/** Shortcut buttons, shown only for actions the member may perform. */
export function QuickActions({ permissions }: { permissions: ReadonlySet<string> }) {
  const primary = PRIMARY.filter((a) => permissions.has(a.permission));
  const more = SECONDARY.filter((a) => permissions.has(a.permission));
  if (primary.length === 0 && more.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary.map((a, i) => (
        <Button key={a.href} asChild size="sm" variant={i === 0 ? "default" : "outline"}>
          <Link href={a.href}>
            <a.icon />
            {a.label}
          </Link>
        </Button>
      ))}
      {more.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              More
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {more.map((a) => (
              <DropdownMenuItem key={a.href} asChild>
                <Link href={a.href}>
                  <a.icon />
                  {a.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
