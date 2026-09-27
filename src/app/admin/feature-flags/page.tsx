import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { CreateFlagDialog, FeatureFlagList } from "@/components/admin/feature-flags";
import { requireAdminPage } from "@/services/admin/guard";
import { listFeatureFlags } from "@/services/admin/feature-flags";

export const metadata = { title: "Feature flags" };

export default async function AdminFeatureFlagsPage() {
  const ctx = await requireAdminPage();
  const flags = await listFeatureFlags(ctx);
  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Global switches with per-organization overrides. An override always wins over the global value."
        actions={
          <CreateFlagDialog
            trigger={
              <Button>
                <Plus />
                New flag
              </Button>
            }
          />
        }
      >
        <PrivacyNotice />
      </PageHeader>
      <FeatureFlagList flags={flags} />
    </>
  );
}
