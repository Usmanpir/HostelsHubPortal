"use client";

import Link from "next/link";
import { Activity, BedDouble, CreditCard, FileText, LogIn, LogOut, MessageSquareWarning, UserPlus, Users, Wrench, IdCard, type LucideIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormatters } from "@/components/shared/org-context";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityItem, ActivityKind } from "@/services/dashboard/activity";

const KIND: Record<ActivityKind, { icon: LucideIcon; className: string }> = {
  resident: { icon: UserPlus, className: "bg-info-soft text-info" },
  checkin: { icon: LogIn, className: "bg-success-soft text-success" },
  checkout: { icon: LogOut, className: "bg-muted text-muted-foreground" },
  payment: { icon: CreditCard, className: "bg-success-soft text-success" },
  invoice: { icon: FileText, className: "bg-violet-soft text-violet" },
  complaint: { icon: MessageSquareWarning, className: "bg-warning-soft text-warning" },
  maintenance: { icon: Wrench, className: "bg-warning-soft text-warning" },
  staff: { icon: Users, className: "bg-accent text-accent-foreground" },
  visitor: { icon: IdCard, className: "bg-accent text-accent-foreground" },
  other: { icon: BedDouble, className: "bg-muted text-muted-foreground" },
};

export function ActivityFeed({ items, viewAllHref, className }: { items: ActivityItem[]; viewAllHref?: string; className?: string }) {
  const fmt = useFormatters();
  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        {viewAllHref ? (
          <CardAction>
            <Link
              href={viewAllHref}
              className="rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              View all
            </Link>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Activity className="size-5" />
            Activity will appear here as your team works.
          </div>
        ) : (
          <ol className="flex flex-col">
            {items.map((item, i) => {
              const k = KIND[item.kind];
              const Icon = k.icon;
              const body = (
                <>
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", k.className)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm leading-snug">
                      {item.actor ? <span className="font-medium">{item.actor} </span> : null}
                      {item.parts.map((p, j) => (
                        <span key={j}>
                          {j > 0 ? " " : ""}
                          {"amount" in p ? (
                            <span className="tabular font-medium">{fmt.money(p.amount)}</span>
                          ) : p.strong ? (
                            <span className="font-medium">{p.text}</span>
                          ) : (
                            <span className="text-muted-foreground">{p.text}</span>
                          )}
                        </span>
                      ))}
                    </span>
                    <time dateTime={new Date(item.at).toISOString()} title={fmt.dateTime(item.at)} className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {formatRelative(item.at)}
                    </time>
                  </span>
                </>
              );
              return (
                <li key={item.id} className={cn("relative", i < items.length - 1 && "border-b")}>
                  {item.href ? (
                    <Link href={item.href} className="-mx-2 flex gap-3 rounded-lg px-2 py-3 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
