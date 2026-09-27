import Link from "next/link";
import { Flag } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { ChangePlanDialog, ExtendTrialDialog, OrganizationStatusButton } from "@/components/admin/organization-actions";
import { actionLabel, actionTone, intervalLabels, organizationStatusLabels, organizationStatusTones } from "@/components/admin/labels";
import { Progress } from "@/components/ui/progress";
import { requireAdminPage } from "@/services/admin/guard";
import { getOrganizationDetail } from "@/services/admin/organization-service";
import { listPlanOptions } from "@/services/admin/plan-service";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { subscriptionStatusLabels, subscriptionStatusTones } from "@/config/labels";
import type { PlanLimits } from "@/config/plans";
import { cn } from "@/lib/utils";

export const metadata = { title: "Organization" };

const USAGE: { key: "hostels" | "beds" | "residents" | "staff" | "storageMb"; limit: keyof PlanLimits; label: string; unit?: string }[] = [
  { key: "hostels", limit: "maxHostels", label: "Hostels" },
  { key: "beds", limit: "maxBeds", label: "Beds" },
  { key: "residents", limit: "maxResidents", label: "Active residents" },
  { key: "staff", limit: "maxStaff", label: "Staff" },
  { key: "storageMb", limit: "maxStorageMb", label: "Storage", unit: "MB" },
];

export default async function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminPage();
  const { id } = await params;
  const [org, plans] = await Promise.all([loadOr404(getOrganizationDetail(ctx, id)), listPlanOptions(ctx)]);
  const sub = org.subscription;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {org.name}
            <EnumBadge value={org.status} labels={organizationStatusLabels} tones={organizationStatusTones} />
          </span>
        }
        description={<span className="font-mono text-xs">{org.slug}</span>}
        breadcrumbs={[{ label: "Organizations", href: "/admin/organizations" }, { label: org.name }]}
        actions={
          <>
            <ChangePlanDialog id={org.id} plans={plans} current={sub ? { planId: sub.plan.id, interval: sub.interval } : null} />
            <ExtendTrialDialog id={org.id} disabled={!sub || sub.status === "ACTIVE"} />
            <OrganizationStatusButton id={org.id} name={org.name} status={org.status} />
          </>
        }
      >
        <PrivacyNotice />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Subscription</h2>
              {sub ? <EnumBadge value={sub.status} labels={subscriptionStatusLabels} tones={subscriptionStatusTones} /> : null}
            </div>
            {sub ? (
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <Item label="Plan" value={`${sub.plan.name}`} />
                <Item label="Interval" value={intervalLabels[sub.interval]} />
                <Item
                  label="Price"
                  value={
                    sub.interval === "YEARLY"
                      ? `${formatMoney(sub.plan.priceYearly, sub.plan.currency)}/yr`
                      : `${formatMoney(sub.plan.priceMonthly, sub.plan.currency)}/mo`
                  }
                />
                <Item label="Provider" value={sub.provider} />
                {sub.status === "TRIALING" ? <Item label="Trial ends" value={formatDate(sub.trialEndsAt)} /> : null}
                <Item label="Period start" value={formatDate(sub.currentPeriodStart)} />
                <Item label={sub.status === "TRIALING" ? "Period end" : "Renews / ends"} value={formatDate(sub.currentPeriodEnd)} />
                {sub.cancelAtPeriodEnd ? <Item label="Cancels" value="At period end" /> : null}
                {sub.canceledAt ? <Item label="Canceled" value={formatDate(sub.canceledAt)} /> : null}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No subscription. Use “Change plan” to assign one.</p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">Usage vs plan limits</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {USAGE.map((u) => {
                const used = org.usage[u.key];
                const max = org.limits[u.limit] ?? null;
                const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
                return (
                  <li key={u.key} className="grid gap-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">{u.label}</span>
                      <span className="tabular">
                        <span className="font-semibold">{formatNumber(used)}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          / {max === null ? "Unlimited" : formatNumber(max)}
                          {u.unit ? ` ${u.unit}` : ""}
                        </span>
                      </span>
                    </div>
                    <Progress value={max === null ? 0 : pct} className={cn(pct >= 90 && "*:bg-danger")} aria-label={`${u.label} usage`} />
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">Aggregate counts only.</p>
          </section>

          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Admin history</h2>
              <Link href={`/admin/audit-log?organizationId=${org.id}`} className="text-xs text-muted-foreground hover:text-primary">
                Full audit log
              </Link>
            </header>
            {org.adminHistory.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No admin actions on this organization yet.</p>
            ) : (
              <ul className="divide-y">
                {org.adminHistory.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <StatusBadge tone={actionTone(h.action)}>{actionLabel(h.action)}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{h.user?.email ?? "System"}</span>
                    <span className="ms-auto text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Profile</h2>
            <dl className="grid gap-3 text-sm">
              {org.brandName ? <Item label="Brand name" value={org.brandName} /> : null}
              <Item label="Contact email" value={org.email ?? "—"} />
              <Item label="Contact phone" value={org.phone ?? "—"} />
              <Item label="Location" value={[org.city, org.country].filter(Boolean).join(", ") || "—"} />
              <Item label="Currency · time zone" value={`${org.currency} · ${org.timezone}`} />
              {org.customDomain ? <Item label="Custom domain" value={org.customDomain} /> : null}
              <Item label="Created" value={formatDate(org.createdAt)} />
              <Item label="Onboarding" value={org.onboardingCompletedAt ? `Completed ${formatDate(org.onboardingCompletedAt)}` : "Not completed"} />
              <Item label="Active team members" value={String(org.activeMembers)} />
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Owners</h2>
            {org.owners.length === 0 ? (
              <p className="text-sm text-muted-foreground">No owner account.</p>
            ) : (
              <ul className="grid gap-2">
                {org.owners.map((o) => (
                  <li key={o.id} className="text-sm">
                    <p className="font-medium">{o.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{o.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.status === "DISABLED" ? "Disabled · " : ""}Last login {o.lastLoginAt ? formatDate(o.lastLoginAt) : "never"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Feature overrides</h2>
              <Link href="/admin/feature-flags" className="text-xs text-muted-foreground hover:text-primary">
                Manage
              </Link>
            </div>
            {org.featureOverrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">Uses global flag values.</p>
            ) : (
              <ul className="grid gap-1.5">
                {org.featureOverrides.map((f) => (
                  <li key={f.flagKey} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
                      <Flag className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.flagKey}</span>
                    </span>
                    <StatusBadge tone={f.enabled ? "success" : "neutral"}>{f.enabled ? "On" : "Off"}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
