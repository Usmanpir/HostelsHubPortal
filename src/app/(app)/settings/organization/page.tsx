import { SectionHeader } from "@/components/settings/section-header";
import { OrganizationProfileForm } from "@/components/settings/organization-profile-form";
import { getOrganizationSettings } from "@/services/organization/settings-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
  const ctx = await requireSettingsPage("settings.organization");
  const { profile } = await getOrganizationSettings(ctx);
  return (
    <>
      <SectionHeader
        title="Organization profile"
        description="How your organization appears on invoices, receipts and emails."
      />
      <OrganizationProfileForm
        initial={{
          name: profile.name,
          email: profile.email ?? "",
          phone: profile.phone ?? "",
          address: profile.address ?? "",
          city: profile.city ?? "",
          country: profile.country ?? "",
          currency: profile.currency,
          timezone: profile.timezone,
          locale: profile.locale,
        }}
        logo={profile.logo}
      />
    </>
  );
}
