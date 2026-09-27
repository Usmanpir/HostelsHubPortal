import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { allowedSettingsSections } from "@/components/settings/sections";
import { requireTenantPage } from "@/lib/tenant/server";

export const metadata = { title: { template: "%s · Settings", default: "Settings" } };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantPage();
  const sections = allowedSettingsSections(ctx.permissions).map(({ key, href, label }) => ({ key, href, label }));

  return (
    <>
      <PageHeader title="Settings" description={`Manage ${ctx.organization.name}, your team and your account.`} />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <SettingsNav sections={sections} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
