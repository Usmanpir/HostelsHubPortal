import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { AuditTable } from "@/components/admin/audit-table";
import { requireAdminPage } from "@/services/admin/guard";
import { listPlatformAudit } from "@/services/admin/audit-service";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { AUDIT_SCOPES } from "@/lib/validation/admin";
import { getOrganizationName } from "@/services/admin/organization-service";

export const metadata = { title: "Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAdminPage();
  const params = await searchParams;
  const organizationId = sp(params, "organizationId");
  const [data, org] = await Promise.all([
    listPlatformAudit(ctx, {
      q: sp(params, "q"),
      scope: spEnum(params, "scope", AUDIT_SCOPES) ?? "all",
      organizationId,
      page: spNumber(params, "page", 1),
      pageSize: spNumber(params, "pageSize", 20),
    }),
    organizationId ? getOrganizationName(ctx, organizationId) : null,
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every recorded action across the platform. Details are shown only for admin actions; tenant payloads stay private."
      >
        <PrivacyNotice />
        {org ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Organization:</span>
            <span className="font-medium">{org}</span>
            <Button asChild size="xs" variant="ghost">
              <Link href="/admin/audit-log">
                <X />
                Clear
              </Link>
            </Button>
          </div>
        ) : null}
      </PageHeader>
      <AuditTable
        data={data}
        filters={[
          {
            key: "scope",
            label: "Scope",
            options: [
              { value: "platform", label: "Platform events" },
              { value: "admin", label: "Admin actions" },
            ],
          },
        ]}
      />
    </>
  );
}
