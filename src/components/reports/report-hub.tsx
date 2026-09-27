import Link from "next/link";
import {
  AlarmClock,
  ArrowUpRight,
  Banknote,
  BedDouble,
  CalendarCheck,
  DoorOpen,
  IdCard,
  LogIn,
  LogOut,
  MessageSquareWarning,
  Receipt,
  Scale,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReportGroup, ReportIcon, ReportMeta } from "@/services/reports/registry";
import { REPORT_GROUPS } from "@/services/reports/registry";

export const REPORT_ICONS: Record<ReportIcon, LucideIcon> = {
  bed: BedDouble,
  door: DoorOpen,
  users: Users,
  login: LogIn,
  logout: LogOut,
  wallet: Wallet,
  alarm: AlarmClock,
  trending: TrendingUp,
  receipt: Receipt,
  scale: Scale,
  calendar: CalendarCheck,
  banknote: Banknote,
  wrench: Wrench,
  message: MessageSquareWarning,
  badge: IdCard,
};

/** Report catalog grouped by area; `reports` is already filtered by permission. */
export function ReportHub({ reports }: { reports: ReportMeta[] }) {
  const groups = REPORT_GROUPS.map((g) => ({ ...g, items: reports.filter((r) => r.group === (g.key as ReportGroup)) })).filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{g.label}</h2>
            <p className="text-sm text-muted-foreground">{g.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((r) => {
              const Icon = REPORT_ICONS[r.icon];
              return (
                <Link
                  key={r.key}
                  href={`/reports/${r.key}`}
                  className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 font-medium">
                      {r.title}
                      {r.financial ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Financial</span> : null}
                    </span>
                    <span className="text-sm text-muted-foreground">{r.description}</span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
