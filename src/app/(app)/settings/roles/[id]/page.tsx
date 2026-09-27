import { SectionHeader } from "@/components/settings/section-header";
import { RolePermissionEditor } from "@/components/settings/role-permission-editor";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import Link from "next/link";
import { loadOr404 } from "@/lib/page-helpers";
import { hasFeature } from "@/lib/subscription/limits";
import { prisma } from "@/lib/db/prisma";
import { PLAN_FEATURES } from "@/config/plans";
import { getRole } from "@/services/organization/role-service";
import { requireSettingsPage } from "../../guard";

export const metadata = { title: "Edit role" };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSettingsPage("settings.roles");
  const { id } = await params;
  const [role, customRolesAllowed] = await Promise.all([
    loadOr404(getRole(ctx, id)),
    hasFeature(prisma, ctx.organizationId, PLAN_FEATURES.customRoles),
  ]);

  return (
    <>
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/settings/roles">Roles & permissions</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{role.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <SectionHeader
        title={role.name}
        description={
          role.isOwnerRole
            ? "The Owner role always has every permission. It can't be edited or deleted."
            : role.isSystem
              ? "Built-in role. You can adjust its permissions; changes apply to every member with this role immediately."
              : "Custom role. Changes apply to every member with this role immediately."
        }
      />
      <RolePermissionEditor role={role} isOwner={ctx.isOwner} heldPermissions={[...ctx.permissions]} customRolesAllowed={customRolesAllowed} />
    </>
  );
}
