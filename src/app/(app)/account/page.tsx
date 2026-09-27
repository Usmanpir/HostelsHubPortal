import type { Metadata } from "next";
import { KeyRound, Palette, UserRound, Building2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ChangePasswordForm, OrganizationList, ProfileForm, ThemePreference } from "@/components/auth/account-forms";
import { requireTenantPage } from "@/lib/tenant/server";
import { formatDate } from "@/lib/format";
import { getAccount } from "@/services/auth/auth-service";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const ctx = await requireTenantPage();
  const account = await getAccount(ctx.userId);

  const organizations = account.memberships
    .filter((m) => m.organization.status === "ACTIVE")
    .map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      roleName: m.role.name,
      isOwner: m.isOwner,
      location: [m.organization.city, m.organization.country].filter(Boolean).join(", ") || null,
      hostelAccess: m.allHostels
        ? "All hostels"
        : `${m._count.hostelAccess} hostel${m._count.hostelAccess === 1 ? "" : "s"}`,
    }));

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="My account"
        description={`Signed in as ${account.email}${account.lastLoginAt ? ` · last sign-in ${formatDate(account.lastLoginAt)}` : ""}`}
      />
      <div className="grid gap-6">
        <Section icon={UserRound} title="Profile" description="Your name and phone number are visible to teammates.">
          <ProfileForm name={account.name} phone={account.phone} email={account.email} emailVerified={!!account.emailVerifiedAt} />
        </Section>

        <Section icon={KeyRound} title="Password" description="Use at least 8 characters with a letter and a number.">
          <ChangePasswordForm />
        </Section>

        <Section
          icon={Building2}
          title="Organizations"
          description={`You're a member of ${organizations.length} organization${organizations.length === 1 ? "" : "s"}. Member since ${formatDate(account.createdAt)}.`}
        >
          <OrganizationList organizations={organizations} activeId={ctx.organizationId} />
        </Section>

        <Section icon={Palette} title="Appearance" description="Saved on this device.">
          <ThemePreference />
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-start gap-3 border-b px-4 py-4 sm:px-6">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="px-4 py-5 sm:px-6">{children}</div>
    </section>
  );
}
