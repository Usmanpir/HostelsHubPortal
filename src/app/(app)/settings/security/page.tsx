import Link from "next/link";
import { KeyRound } from "lucide-react";
import { SectionHeader, SettingsPanel } from "@/components/settings/section-header";
import { SignInsTable } from "@/components/settings/sign-ins-table";
import { SignOutEverywhere } from "@/components/settings/sign-out-everywhere";
import { can } from "@/lib/tenant/context";
import { formatDateTime } from "@/lib/format";
import { getSecurityOverview, listRecentSignIns } from "@/services/organization/settings-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const ctx = await requireSettingsPage(null);
  const canViewAudit = can(ctx, "audit.view");
  const [overview, signIns] = await Promise.all([
    getSecurityOverview(ctx),
    canViewAudit ? listRecentSignIns(ctx, { limit: 50 }) : Promise.resolve(null),
  ]);
  const { timezone, locale } = ctx.organization;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionHeader title="Security" description="Protect your account and review sign-in activity." />
        <SettingsPanel
          title="Active sessions"
          description="Signed in on a shared or lost device? Sign out everywhere to end every session, including this one."
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="font-medium">{overview.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd>{overview.lastLoginAt ? formatDateTime(overview.lastLoginAt, timezone, locale) : "—"}</dd>
              </div>
            </dl>
            <SignOutEverywhere />
          </div>
        </SettingsPanel>
        <SettingsPanel title="Password" description="Your password and profile details are managed on your account page.">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <KeyRound className="size-4" />
            Go to my account
          </Link>
        </SettingsPanel>
      </section>

      {signIns ? (
        <section>
          <SectionHeader title="Recent sign-ins" description="The latest sign-ins by members of your organization." />
          <SignInsTable rows={signIns} />
        </section>
      ) : null}
    </div>
  );
}
