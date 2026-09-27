import { SectionHeader } from "@/components/settings/section-header";
import { NotificationSettingsForm } from "@/components/settings/notification-settings-form";
import { can } from "@/lib/tenant/context";
import { getOrganizationSettings } from "@/services/organization/settings-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Notifications" };

export default async function NotificationSettingsPage() {
  const ctx = await requireSettingsPage("settings.organization");
  const { notifications, features } = await getOrganizationSettings(ctx);
  return (
    <>
      <SectionHeader
        title="Notifications"
        description="Choose which events create notifications for your team and residents, and whether they're also emailed."
      />
      <NotificationSettingsForm
        initial={notifications}
        emailAllowed={features.emailNotifications}
        canManageBilling={can(ctx, "settings.billing")}
      />
    </>
  );
}
