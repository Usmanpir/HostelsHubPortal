import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/settings/section-header";
import { RoleDialog } from "@/components/settings/role-dialog";
import { RolesList } from "@/components/settings/roles-list";
import { UpgradeHint } from "@/components/settings/upgrade-hint";
import { can } from "@/lib/tenant/context";
import { ALL_PERMISSIONS } from "@/lib/permissions/catalog";
import { listRoles } from "@/services/organization/role-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requireSettingsPage("settings.roles");
  const { roles, customRolesAllowed } = await listRoles(ctx);

  return (
    <>
      <SectionHeader
        title="Roles & permissions"
        description="Roles decide what members can see and do. Hostel access is set per member."
        actions={
          customRolesAllowed ? (
            <RoleDialog
              mode="create"
              trigger={
                <Button>
                  <Plus />
                  New role
                </Button>
              }
            />
          ) : null
        }
      />
      {!customRolesAllowed ? (
        <UpgradeHint
          className="mb-4"
          title="Custom roles are available on Business and Enterprise"
          description="You can still adjust the permissions of the built-in roles. Upgrade to create and duplicate your own roles."
          canManageBilling={can(ctx, "settings.billing")}
        />
      ) : null}
      <RolesList
        roles={roles}
        totalPermissions={ALL_PERMISSIONS.length}
        customRolesAllowed={customRolesAllowed}
      />
    </>
  );
}
