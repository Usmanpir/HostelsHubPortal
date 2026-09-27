"use client";

import {
  AlarmClock,
  ArrowDownRight,
  ArrowUpRight,
  BedDouble,
  BedSingle,
  Building2,
  DoorOpen,
  HandCoins,
  Receipt,
  TrendingUp,
  UserCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { useValueFormat } from "@/components/reports/use-value-format";
import { cn } from "@/lib/utils";

export type KpiIcon = "hostels" | "rooms" | "beds" | "occupied" | "available" | "maintenance" | "residents" | "staff" | "revenue" | "collected" | "outstanding" | "expenses";

const ICONS: Record<KpiIcon, LucideIcon> = {
  hostels: Building2,
  rooms: DoorOpen,
  beds: BedDouble,
  occupied: BedSingle,
  available: BedDouble,
  maintenance: Wrench,
  residents: Users,
  staff: UserCheck,
  revenue: TrendingUp,
  collected: HandCoins,
  outstanding: AlarmClock,
  expenses: Receipt,
};

export type Kpi = {
  key: string;
  label: string;
  value: number;
  format: "money" | "number";
  icon: KpiIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  href?: string;
  hint?: string;
  /** % change vs the comparison period; colour = direction × whether up is good. */
  delta?: { pct: number | null; goodWhenUp: boolean; label: string };
};

function Delta({ delta }: { delta: NonNullable<Kpi["delta"]> }) {
  if (delta.pct === null) return <span>No data for {delta.label}</span>;
  const up = delta.pct > 0;
  const flat = delta.pct === 0;
  const good = flat ? null : up === delta.goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-flex items-center gap-0.5 font-medium", good === true && "text-success", good === false && "text-danger")}>
        {!flat ? <Icon className="size-3.5" aria-hidden /> : null}
        {flat ? "No change" : `${up ? "+" : ""}${delta.pct}%`}
      </span>
      <span>vs {delta.label}</span>
    </span>
  );
}

export function KpiGrid({ items, className }: { items: Kpi[]; className?: string }) {
  const fmt = useValueFormat();
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {items.map((k) => (
        <StatCard
          key={k.key}
          label={k.label}
          value={fmt.value(k.format, k.value)}
          icon={ICONS[k.icon]}
          tone={k.tone}
          href={k.href}
          hint={k.delta ? <Delta delta={k.delta} /> : k.hint}
        />
      ))}
    </div>
  );
}
