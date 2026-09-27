"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, MoreHorizontal, TimerOff } from "lucide-react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { subscriptionStatusLabels, subscriptionStatusTones } from "@/config/labels";
import type { BillingInterval, OrganizationStatus, SubscriptionStatus } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { formatDate, formatMoney } from "@/lib/format";
import { setSubscriptionStatusAction } from "@/app/admin/actions";
import { intervalLabels } from "./labels";
import { ControlledConfirm } from "./controlled-confirm";

export type SubscriptionRow = {
  id: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  provider: string;
  organization: { id: string; name: string; slug: string; status: OrganizationStatus };
  plan: { id: string; name: string; priceMonthly: number; priceYearly: number; currency: string };
};

function renewal(s: SubscriptionRow) {
  const date = s.status === "TRIALING" ? s.trialEndsAt ?? s.currentPeriodEnd : s.currentPeriodEnd;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400_000);
  return { date, days };
}

export function SubscriptionsTable({ data, filters }: { data: Paginated<SubscriptionRow>; filters: FilterDef[] }) {
  const [pending, setPending] = useState<{ row: SubscriptionRow; status: "ACTIVE" | "EXPIRED" } | null>(null);

  const actions = (s: SubscriptionRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.organization.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem disabled={s.status === "ACTIVE"} onSelect={() => setPending({ row: s, status: "ACTIVE" })}>
          <CheckCircle2 />
          Mark active
        </DropdownMenuItem>
        <DropdownMenuItem disabled={s.status === "EXPIRED"} onSelect={() => setPending({ row: s, status: "EXPIRED" })}>
          <TimerOff />
          Mark expired
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/organizations/${s.organization.id}`}>Open organization</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<SubscriptionRow>[] = [
    {
      id: "org",
      header: "Organization",
      hideable: false,
      cell: (s) => (
        <Link href={`/admin/organizations/${s.organization.id}`} className="flex flex-col hover:text-primary">
          <span className="font-medium">{s.organization.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{s.organization.slug}</span>
        </Link>
      ),
    },
    { id: "status", header: "Status", cell: (s) => <EnumBadge value={s.status} labels={subscriptionStatusLabels} tones={subscriptionStatusTones} /> },
    {
      id: "plan",
      header: "Plan",
      cell: (s) => (
        <span>
          {s.plan.name} <span className="text-xs text-muted-foreground">· {intervalLabels[s.interval]}</span>
        </span>
      ),
    },
    {
      id: "price",
      header: "Price",
      align: "end",
      cell: (s) =>
        s.interval === "YEARLY" ? `${formatMoney(s.plan.priceYearly, s.plan.currency)}/yr` : `${formatMoney(s.plan.priceMonthly, s.plan.currency)}/mo`,
    },
    {
      id: "renewal",
      header: "Trial end / renewal",
      cell: (s) => {
        const r = renewal(s);
        return (
          <span className="flex flex-col">
            <span>{formatDate(r.date)}</span>
            <span className={r.days < 0 ? "text-xs text-danger" : r.days <= 7 ? "text-xs text-warning" : "text-xs text-muted-foreground"}>
              {r.days < 0 ? `${-r.days} days ago` : r.days === 0 ? "Today" : `in ${r.days} days`}
              {s.cancelAtPeriodEnd ? " · cancels" : ""}
            </span>
          </span>
        );
      },
    },
    { id: "provider", header: "Provider", cell: (s) => <StatusBadge tone="neutral" dot={false}>{s.provider}</StatusBadge>, defaultHidden: true },
    { id: "actions", header: "", hideable: false, hideOnMobile: true, align: "end", cell: actions },
  ];

  return (
    <>
      <DataTable
        rows={data.items}
        columns={columns}
        getRowId={(s) => s.id}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        pageSize={data.pageSize}
        searchPlaceholder="Search organization"
        filters={filters}
        storageKey="admin-subscriptions"
        mobileCard={(s) => {
          const r = renewal(s);
          return (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.organization.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.plan.name} · {intervalLabels[s.interval]}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <EnumBadge value={s.status} labels={subscriptionStatusLabels} tones={subscriptionStatusTones} />
                  {s.status === "TRIALING" ? "Trial ends" : "Renews"} {formatDate(r.date)}
                </div>
              </div>
              {actions(s)}
            </div>
          );
        }}
      />
      {pending ? (
        <ControlledConfirm
          key={`${pending.row.id}-${pending.status}`}
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={pending.status === "ACTIVE" ? `Mark ${pending.row.organization.name} active?` : `Mark ${pending.row.organization.name} expired?`}
          description={
            pending.status === "ACTIVE"
              ? "Use after payment was received offline. If the period has lapsed, a new billing period starts today."
              : "The organization can no longer add hostels, beds, residents or staff until it renews. Existing data stays intact."
          }
          confirmLabel={pending.status === "ACTIVE" ? "Mark active" : "Mark expired"}
          destructive={pending.status === "EXPIRED"}
          action={() => setSubscriptionStatusAction(pending.row.id, { status: pending.status })}
        />
      ) : null}
    </>
  );
}
