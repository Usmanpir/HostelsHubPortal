import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireTenantPage } from "@/lib/tenant/server";
import { filterNavigation } from "@/config/navigation";
import { getMessages } from "@/lib/i18n";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getSubscription, getTrialDaysLeft, isSubscriptionUsable } from "@/lib/subscription/limits";
import { AppShell } from "@/components/layout/app-shell";
import { OrgProvider } from "@/components/shared/org-context";
import { APP_NAME } from "@/config/defaults";
import { isAssistantConfigured } from "@/services/assistant/assistant-service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantPage();
  const [hostels, memberships, subscription] = await Promise.all([
    listHostelOptions(ctx),
    prisma.organizationMember.findMany({
      where: { userId: ctx.userId, status: "ACTIVE", organization: { status: "ACTIVE", deletedAt: null } },
      select: { organization: { select: { id: true, name: true } } },
    }),
    getSubscription(prisma, ctx.organizationId),
  ]);
  const messages = getMessages(ctx.organization.locale, ctx.organization.businessType);
  const org = ctx.organization;
  const brandColor = org.primaryColor && /^#[0-9a-f]{6}$/i.test(org.primaryColor) ? org.primaryColor : null;

  const trialDaysLeft = getTrialDaysLeft(subscription);
  const usable = isSubscriptionUsable(subscription);

  const banner = !usable ? (
    <div className="flex items-center gap-2 border-b bg-danger-soft px-4 py-2 text-sm text-danger">
      <AlertTriangle className="size-4" />
      <span>Your subscription is inactive. You can&apos;t add hostels, beds, residents or staff until you renew.</span>
      {ctx.permissions.has("settings.billing") ? (
        <Link href="/settings/billing" className="ms-auto font-medium underline underline-offset-4">
          Manage plan
        </Link>
      ) : null}
    </div>
  ) : trialDaysLeft !== null && trialDaysLeft <= 7 ? (
    <div className="flex items-center gap-2 border-b bg-info-soft px-4 py-2 text-sm text-info">
      <span>
        Your free trial ends in {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"}.
      </span>
      {ctx.permissions.has("settings.billing") ? (
        <Link href="/settings/billing" className="ms-auto font-medium underline underline-offset-4">
          Choose a plan
        </Link>
      ) : null}
    </div>
  ) : null;

  return (
    <OrgProvider
      value={{
        id: org.id,
        name: org.name,
        currency: org.currency,
        timezone: org.timezone,
        locale: org.locale,
        permissions: [...ctx.permissions],
        activeHostelId: ctx.activeHostelId,
        businessType: org.businessType,
        modules: { owners: org.ownersEnabled, dealer: org.dealerEnabled, publicListings: org.publicListingsEnabled },
      }}
    >
      {brandColor ? <style>{`:root{--brand:${brandColor}}`}</style> : null}
      <AppShell
        nav={filterNavigation(ctx.permissions, { owners: org.ownersEnabled, dealer: org.dealerEnabled })}
        messages={messages}
        brand={{ name: org.brandName || org.name || APP_NAME, logoUrl: org.logoFileId ? `/api/files/${org.logoFileId}` : null }}
        user={{ name: ctx.userName, email: ctx.userEmail, roleName: ctx.roleName }}
        hostels={hostels}
        activeHostelId={ctx.activeHostelId}
        allowAllHostels={ctx.allHostels || ctx.accessibleHostelIds.length > 1}
        organizations={memberships.map((m) => m.organization)}
        activeOrganizationId={ctx.organizationId}
        permissions={[...ctx.permissions]}
        banner={banner}
        assistantEnabled={isAssistantConfigured()}
      >
        {children}
      </AppShell>
    </OrgProvider>
  );
}
