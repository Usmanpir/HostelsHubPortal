import { PageHeader } from "@/components/shared/page-header";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { UsersTable } from "@/components/admin/users-table";
import { requireAdminPage } from "@/services/admin/guard";
import { listUsers } from "@/services/admin/user-service";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { USER_STATUSES } from "@/lib/validation/admin";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAdminPage();
  const params = await searchParams;
  const data = await listUsers(ctx, {
    q: sp(params, "q"),
    status: spEnum(params, "status", USER_STATUSES),
    role: spEnum(params, "role", ["superadmin"] as const),
    page: spNumber(params, "page", 1),
    pageSize: spNumber(params, "pageSize", 20),
  });

  return (
    <>
      <PageHeader title="Users" description="Every account on the platform. Disabling an account signs it out everywhere.">
        <PrivacyNotice />
      </PageHeader>
      <UsersTable
        data={data}
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "DISABLED", label: "Disabled" },
            ],
          },
          { key: "role", label: "Role", options: [{ value: "superadmin", label: "Super admins" }] },
        ]}
      />
    </>
  );
}
