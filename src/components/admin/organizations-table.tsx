"use client";

import Link from "next/link";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { subscriptionStatusLabels, subscriptionStatusTones } from "@/config/labels";
import type { OrganizationStatus, SubscriptionStatus, BillingInterval } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { formatDate } from "@/lib/format";
import { intervalLabels, organizationStatusLabels, organizationStatusTones } from "./labels";

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: Date;
  hostels: number;
  residents: number;
  members: number;
  subscription: {
    status: SubscriptionStatus;
    interval: BillingInterval;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date;
    plan: { id: string; name: string };
  } | null;
};

export function OrganizationsTable({ data, filters }: { data: Paginated<OrganizationRow>; filters: FilterDef[] }) {
  const columns: Column<OrganizationRow>[] = [
    {
      id: "name",
      header: "Organization",
      hideable: false,
      cell: (o) => (
        <Link href={`/admin/organizations/${o.id}`} className="flex flex-col hover:text-primary">
          <span className="font-medium">{o.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{o.slug}</span>
        </Link>
      ),
    },
    { id: "status", header: "Status", cell: (o) => <EnumBadge value={o.status} labels={organizationStatusLabels} tones={organizationStatusTones} /> },
    {
      id: "plan",
      header: "Plan",
      cell: (o) =>
        o.subscription ? (
          <span>
            {o.subscription.plan.name}
            <span className="text-xs text-muted-foreground"> · {intervalLabels[o.subscription.interval]}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    {
      id: "subscription",
      header: "Subscription",
      cell: (o) =>
        o.subscription ? (
          <EnumBadge value={o.subscription.status} labels={subscriptionStatusLabels} tones={subscriptionStatusTones} />
        ) : (
          <StatusBadge tone="neutral">No subscription</StatusBadge>
        ),
    },
    { id: "hostels", header: "Hostels", align: "end", cell: (o) => o.hostels },
    { id: "residents", header: "Residents", align: "end", cell: (o) => o.residents },
    { id: "members", header: "Team", align: "end", cell: (o) => o.members, defaultHidden: true },
    { id: "created", header: "Created", cell: (o) => formatDate(o.createdAt) },
  ];
  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(o) => o.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      rowHref={(o) => `/admin/organizations/${o.id}`}
      searchPlaceholder="Search name or slug"
      filters={filters}
      storageKey="admin-organizations"
    />
  );
}
