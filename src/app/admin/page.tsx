import Link from "next/link";
import { Activity, Building2, CreditCard, DollarSign, FlaskConical, Home, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { GrowthChart } from "@/components/admin/growth-chart";
import { actionLabel, actionTone } from "@/components/admin/labels";
import { requireAdminPage } from "@/services/admin/guard";
import { getPlatformOverview } from "@/services/admin/overview-service";
import { formatDateTime, formatMoney, formatNumber, formatRelative } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const ctx = await requireAdminPage();
  const data = await getPlatformOverview(ctx);
  const primaryMrr = data.mrr[0];
  const newThisMonth = data.growth.at(-1)?.count ?? 0;

  return (
    <>
      <PageHeader title="Platform overview" description="Health of the platform at a glance.">
        <PrivacyNotice />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Organizations"
          value={formatNumber(data.organizations)}
          icon={Building2}
          href="/admin/organizations"
          hint={`${newThisMonth} new this month${data.suspended ? ` · ${data.suspended} suspended` : ""}`}
        />
        <StatCard
          label="Active subscriptions"
          value={formatNumber(data.activeSubscriptions)}
          icon={CreditCard}
          tone="success"
          href="/admin/subscriptions?status=ACTIVE"
          hint={data.pastDue ? `${data.pastDue} past due` : "None past due"}
        />
        <StatCard
          label="On trial"
          value={formatNumber(data.trialOrganizations)}
          icon={FlaskConical}
          tone="info"
          href="/admin/subscriptions?status=TRIALING"
        />
        <StatCard
          label="Estimated MRR"
          value={primaryMrr ? formatMoney(primaryMrr.amount, primaryMrr.currency) : formatMoney(0, "USD")}
          icon={DollarSign}
          tone="success"
          hint={
            data.mrr.length > 1
              ? data.mrr.slice(1).map((m) => formatMoney(m.amount, m.currency)).join(" + ")
              : "Active plans · yearly ÷ 12"
          }
        />
        <StatCard label="Hostels" value={formatNumber(data.hostels)} icon={Home} hint="Across all tenants" />
        <StatCard label="Residents" value={formatNumber(data.residents)} icon={Users} hint="Active & on notice (count only)" />
        <StatCard label="Active users" value={formatNumber(data.users)} icon={Users} href="/admin/users" />
        <StatCard label="Past due" value={formatNumber(data.pastDue)} icon={CreditCard} tone={data.pastDue ? "warning" : "default"} href="/admin/subscriptions?status=PAST_DUE" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="rounded-xl border bg-card p-4 lg:col-span-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">New organizations per month</h2>
            <p className="text-xs text-muted-foreground">Last 12 months</p>
          </div>
          <GrowthChart data={data.growth} />
        </section>

        <section className="rounded-xl border bg-card lg:col-span-2">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-muted-foreground" />
              System activity
            </h2>
            <Link href="/admin/audit-log?scope=platform" className="text-xs text-muted-foreground hover:text-primary">
              View all
            </Link>
          </header>
          {data.activity.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No platform activity yet.</p>
          ) : (
            <ul className="divide-y">
              {data.activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <StatusBadge tone={actionTone(a.action)}>{actionLabel(a.action)}</StatusBadge>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {a.organization ? (
                        <Link href={`/admin/organizations/${a.organization.id}`} className="font-medium text-foreground hover:text-primary">
                          {a.organization.name}
                        </Link>
                      ) : (
                        "Platform"
                      )}
                      {a.user ? ` · ${a.user.email}` : ""}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.createdAt.toISOString()} title={formatDateTime(a.createdAt)}>
                    {formatRelative(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
