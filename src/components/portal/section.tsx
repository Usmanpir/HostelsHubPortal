import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Card section used across portal pages. */
export function PortalSection({
  title,
  description,
  href,
  hrefLabel = "View all",
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action ??
          (href ? (
            <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-primary">
              {hrefLabel}
              <ChevronRight className="size-3.5 rtl:rotate-180" />
            </Link>
          ) : null)}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Small key/value row used inside detail cards. */
export function DetailRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2 text-sm", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end font-medium break-words">{children}</dd>
    </div>
  );
}

/** Inline empty message for small sections (full-page empties use EmptyState). */
export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
