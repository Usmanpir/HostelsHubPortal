import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { initials } from "@/lib/format";
import { orgLogoUrl } from "./format";

export type PublicOrgView = {
  slug: string;
  displayName: string;
  hasLogo: boolean;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
};

export function OrgLogo({ org, className = "size-10" }: { org: PublicOrgView; className?: string }) {
  return org.hasLogo ? (
    // eslint-disable-next-line @next/next/no-img-element -- authorized public image route
    <img src={orgLogoUrl(org.slug)} alt="" className={`${className} shrink-0 rounded-xl bg-muted object-contain`} />
  ) : (
    <span
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground`}
    >
      {initials(org.displayName) || "·"}
    </span>
  );
}

export function ContactButtons({ org, size = "sm" }: { org: PublicOrgView; size?: "sm" | "default" }) {
  return (
    <>
      {org.phone ? (
        <Button asChild size={size} variant="outline">
          <a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`}>
            <Phone />
            Call
          </a>
        </Button>
      ) : null}
      {org.whatsapp ? (
        <Button asChild size={size} variant="outline">
          <a href={`https://wa.me/${org.whatsapp}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle />
            WhatsApp
          </a>
        </Button>
      ) : null}
      {org.email ? (
        <Button asChild size={size} variant="outline">
          <a href={`mailto:${org.email}`}>
            <Mail />
            Email
          </a>
        </Button>
      ) : null}
    </>
  );
}

/** Sticky top bar shown on every public page of an organization. */
export function OrgHeader({ org }: { org: PublicOrgView }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href={`/l/${org.slug}`} className="flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <OrgLogo org={org} className="size-9" />
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-tight">{org.displayName}</span>
            {org.city ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" aria-hidden />
                {org.city}
              </span>
            ) : null}
          </span>
        </Link>
        <div className="ms-auto flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 sm:flex">
            <ContactButtons org={org} />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
