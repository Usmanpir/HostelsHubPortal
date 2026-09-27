import { BedDouble, CheckCircle2, CreditCard, TrendingUp, Users, Wrench } from "lucide-react";
import { APP_NAME } from "@/config/defaults";
import { cn } from "@/lib/utils";

/**
 * Decorative product illustration for the auth screens, built from CSS and
 * icons. It shows the shape of the product, not real data.
 */
const BED_PATTERN = [
  "o", "o", "a", "o", "o", "r", "o", "a",
  "o", "o", "o", "m", "o", "a", "o", "o",
  "a", "o", "o", "o", "r", "o", "o", "a",
];

const bedTone: Record<string, string> = {
  o: "bg-primary/80",
  a: "bg-success/70",
  r: "bg-warning/70",
  m: "bg-danger/60",
};

const POINTS = [
  { icon: BedDouble, text: "Live bed map across every property" },
  { icon: CreditCard, text: "Rent invoices, payments and receipts" },
  { icon: Users, text: "Residents, staff and role-based access" },
  { icon: Wrench, text: "Maintenance, complaints and visitors" },
];

export function AuthVisual() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-linear-to-br from-primary/8 via-background to-violet/8 p-10 xl:p-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[22px_22px] mask-[radial-gradient(ellipse_at_center,black_40%,transparent_75%)]"
      />
      <div aria-hidden className="pointer-events-none absolute -inset-e-24 -top-24 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -inset-s-16 size-96 rounded-full bg-violet/15 blur-3xl" />

      <div className="relative">
        <p className="text-sm font-medium text-primary">{APP_NAME}</p>
        <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-balance">
          Every hostel, room and bed — in one calm workspace.
        </h2>
      </div>

      <div className="relative my-10" aria-hidden>
        <div className="rounded-2xl border bg-card/80 p-5 shadow-xl shadow-primary/5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Bed map</p>
              <p className="text-lg font-semibold tracking-tight">Second floor</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
              <TrendingUp className="size-3" /> Filling up
            </span>
          </div>
          <div className="mt-4 grid grid-cols-8 gap-1.5">
            {BED_PATTERN.map((t, i) => (
              <span key={i} className={cn("h-6 rounded-md", bedTone[t])} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <Legend className="bg-primary/80" label="Occupied" />
            <Legend className="bg-success/70" label="Available" />
            <Legend className="bg-warning/70" label="Reserved" />
            <Legend className="bg-danger/60" label="Maintenance" />
          </div>
        </div>
        <div className="-mt-6 ms-10 me-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-3 shadow-lg shadow-primary/5">
            <p className="text-[11px] text-muted-foreground">Rent collected</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-3/4 rounded-full bg-primary" />
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3 shadow-lg shadow-primary/5">
            <p className="text-[11px] text-muted-foreground">Open requests</p>
            <div className="mt-2 flex gap-1">
              <span className="h-1.5 flex-1 rounded-full bg-warning/70" />
              <span className="h-1.5 flex-1 rounded-full bg-info/70" />
              <span className="h-1.5 flex-1 rounded-full bg-muted" />
            </div>
          </div>
        </div>
      </div>

      <ul className="relative grid gap-3 text-sm">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-muted-foreground">
            <span className="flex size-7 items-center justify-center rounded-lg border bg-card text-primary">
              <Icon className="size-3.5" />
            </span>
            {text}
            <CheckCircle2 className="ms-auto size-4 text-success/80" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-sm", className)} />
      {label}
    </span>
  );
}
