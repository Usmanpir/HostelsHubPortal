import { SectionHeader } from "@/components/settings/section-header";
import { BusinessModulesForm } from "@/components/settings/business-modules-form";
import { getBusinessModules } from "@/services/organization/settings-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Business & modules" };

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function BusinessSettingsPage() {
  const ctx = await requireSettingsPage("settings.organization");
  const org = await getBusinessModules(ctx);
  return (
    <>
      <SectionHeader
        title="Business & modules"
        description="Tell us how you run your business. This changes the vocabulary in the app and which modules you see."
      />
      <BusinessModulesForm
        initial={{
          businessType: org.businessType,
          ownersEnabled: org.ownersEnabled,
          dealerEnabled: org.dealerEnabled,
          publicListingsEnabled: org.publicListingsEnabled,
          publicProfileIntro: org.publicProfileIntro ?? "",
        }}
        publicUrl={`${appUrl()}/l/${org.slug}`}
      />
    </>
  );
}
