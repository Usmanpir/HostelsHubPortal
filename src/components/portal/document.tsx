import { cn } from "@/lib/utils";

export type DocumentOrg = {
  name: string;
  brandName: string | null;
  logoFileId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
};

/** Printable A4-style paper used for invoices and receipts. */
export function DocumentPaper({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <article
      className={cn(
        "mx-auto w-full max-w-3xl rounded-2xl border bg-card p-5 shadow-sm sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none",
        className,
      )}
    >
      {children}
    </article>
  );
}

export function DocumentHeader({
  org,
  title,
  number,
  children,
}: {
  org: DocumentOrg;
  title: string;
  number: string;
  children?: React.ReactNode;
}) {
  const brand = org.brandName || org.name;
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {org.logoFileId ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file route
          <img src={`/api/files/${org.logoFileId}`} alt="" className="size-12 rounded-lg object-cover" />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            {brand.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="text-sm">
          <p className="text-base font-semibold">{brand}</p>
          {org.address || org.city ? (
            <p className="text-muted-foreground">{[org.address, org.city, org.country].filter(Boolean).join(", ")}</p>
          ) : null}
          {org.phone || org.email ? (
            <p className="text-muted-foreground">{[org.phone, org.email].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
      </div>
      <div className="sm:text-end">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">{title}</p>
        <p className="font-mono text-lg font-semibold">{number}</p>
        {children}
      </div>
    </header>
  );
}

export function PartyBlock({ label, lines }: { label: string; lines: (string | null | undefined)[] }) {
  const shown = lines.filter(Boolean) as string[];
  return (
    <div className="text-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      {shown.map((l, i) => (
        <p key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>
          {l}
        </p>
      ))}
    </div>
  );
}
