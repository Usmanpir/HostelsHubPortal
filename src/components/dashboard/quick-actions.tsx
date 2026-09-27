import Link from "next/link";
import { CreditCard, LogIn, MessageSquarePlus, UserRoundPlus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Permission } from "@/lib/permissions/catalog";

const ACTIONS: { label: string; href: string; permission: Permission; icon: typeof LogIn }[] = [
  { label: "Check in", href: "/residents/check-in", permission: "assignments.manage", icon: LogIn },
  { label: "Record payment", href: "/finance/payments/new", permission: "payments.manage", icon: CreditCard },
  { label: "New complaint", href: "/operations/complaints?new=1", permission: "complaints.manage", icon: MessageSquarePlus },
  { label: "New maintenance", href: "/operations/maintenance?new=1", permission: "maintenance.manage", icon: Wrench },
  { label: "Add visitor", href: "/operations/visitors", permission: "visitors.manage", icon: UserRoundPlus },
];

/** Shortcut buttons, shown only for actions the member may perform. */
export function QuickActions({ permissions }: { permissions: ReadonlySet<string> }) {
  const actions = ACTIONS.filter((a) => permissions.has(a.permission));
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) => (
        <Button key={a.href} asChild size="sm" variant={i === 0 ? "default" : "outline"}>
          <Link href={a.href}>
            <a.icon />
            {a.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
