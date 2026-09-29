import { OrgHeader, ContactButtons } from "@/components/public/org-header";
import { APP_NAME } from "@/config/defaults";
import { loadPublicOrg } from "./data";

export default async function PublicOrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await loadPublicOrg(orgSlug);
  const view = {
    slug: org.slug,
    displayName: org.displayName,
    hasLogo: org.hasLogo,
    phone: org.phone,
    email: org.email,
    whatsapp: org.whatsapp,
    city: org.city,
  };
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Brand colour is validated as #rrggbb in the service before it reaches CSS. */}
      {org.brandColor ? <style>{`:root{--brand:${org.brandColor}}`}</style> : null}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:inset-s-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <OrgHeader org={view} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-medium">{org.displayName}</p>
            {org.city ? <p className="text-muted-foreground">{org.city}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <ContactButtons org={view} />
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {org.displayName} · Powered by {APP_NAME}
        </p>
      </footer>
    </div>
  );
}
