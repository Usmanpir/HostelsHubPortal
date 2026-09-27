import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { SettingDialog, SystemSettingsEditor } from "@/components/admin/system-settings";
import { requireAdminPage } from "@/services/admin/guard";
import { listSystemSettings } from "@/services/admin/system-settings";

export const metadata = { title: "System settings" };

export default async function AdminSettingsPage() {
  const ctx = await requireAdminPage();
  const { settings, suggestions } = await listSystemSettings(ctx);
  return (
    <>
      <PageHeader
        title="System settings"
        description="Platform-wide key/value configuration. Values are validated JSON."
        actions={
          <SettingDialog
            trigger={
              <Button>
                <Plus />
                Add setting
              </Button>
            }
          />
        }
      >
        <PrivacyNotice />
      </PageHeader>
      <SystemSettingsEditor settings={settings} suggestions={suggestions} />
    </>
  );
}
