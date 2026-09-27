import { SectionHeader } from "@/components/settings/section-header";
import { BrandingForm } from "@/components/settings/branding-form";
import { UpgradeHint } from "@/components/settings/upgrade-hint";
import { can } from "@/lib/tenant/context";
import { getOrganizationSettings } from "@/services/organization/settings-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Branding" };

export default async function BrandingSettingsPage() {
  const ctx = await requireSettingsPage("settings.organization");
  const { profile, branding, features } = await getOrganizationSettings(ctx);
  return (
    <>
      <SectionHeader
        title="Branding"
        description="White-label the app for your team and residents with your own name, colour and domain."
      />
      {!features.branding ? (
        <UpgradeHint
          className="mb-4"
          title="Custom branding is available on the Enterprise plan"
          description="Replace the app name and colour with your own, connect a custom domain and send emails from your address."
          canManageBilling={can(ctx, "settings.billing")}
        />
      ) : null}
      <BrandingForm
        allowed={features.branding}
        organizationName={profile.name}
        initial={{
          brandName: branding.brandName ?? "",
          primaryColor: branding.primaryColor ?? "",
          customDomain: branding.customDomain ?? "",
          emailSenderName: branding.emailSenderName ?? "",
          emailSenderAddress: branding.emailSenderAddress ?? "",
        }}
      />
    </>
  );
}
