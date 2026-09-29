"use client";

import { ArrowRight, CircleDot, PencilLine, PlusCircle, Wallet, type LucideIcon } from "lucide-react";
import { useFormatters } from "@/components/shared/org-context";
import { dealStageLabels } from "@/config/real-estate-labels";
import type { DealStage } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type DealHistoryItem = {
  id: string;
  action: string;
  createdAt: Date | string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
};

function side(meta: Record<string, unknown> | null, key: "before" | "after") {
  const v = meta?.[key];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function stageLabel(v: unknown) {
  return typeof v === "string" && v in dealStageLabels ? dealStageLabels[v as DealStage] : null;
}

function describe(item: DealHistoryItem, money: (n: number) => string): { icon: LucideIcon; title: string; detail?: string; tone: string } {
  const before = side(item.metadata, "before");
  const after = side(item.metadata, "after");
  switch (item.action) {
    case "deal.created":
      return { icon: PlusCircle, title: "Deal created", tone: "bg-info-soft text-info" };
    case "deal.updated": {
      const changed = before && after && Number(before.agreedAmount) !== Number(after.agreedAmount);
      return {
        icon: PencilLine,
        title: "Details edited",
        detail: changed ? `Agreed amount ${money(Number(before.agreedAmount))} → ${money(Number(after.agreedAmount))}` : undefined,
        tone: "bg-muted text-muted-foreground",
      };
    }
    case "deal.stage_changed": {
      const to = after?.stage;
      const note = typeof item.metadata?.note === "string" ? item.metadata.note : undefined;
      return {
        icon: ArrowRight,
        title: `${stageLabel(before?.stage) ?? "Stage"} → ${stageLabel(to) ?? "updated"}`,
        detail: note,
        tone: to === "CLOSED_WON" ? "bg-success-soft text-success" : to === "CLOSED_LOST" ? "bg-muted text-muted-foreground" : "bg-warning-soft text-warning",
      };
    }
    case "deal.commission_paid":
      return { icon: Wallet, title: "Commission marked paid", tone: "bg-success-soft text-success" };
    case "deal.commission_unpaid":
      return { icon: Wallet, title: "Commission marked unpaid", tone: "bg-muted text-muted-foreground" };
    default:
      return { icon: CircleDot, title: item.action, tone: "bg-muted text-muted-foreground" };
  }
}

export function DealHistory({ items }: { items: DealHistoryItem[] }) {
  const fmt = useFormatters();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className="relative flex flex-col gap-4">
      {items.map((item, i) => {
        const d = describe(item, fmt.money);
        const Icon = d.icon;
        return (
          <li key={item.id} className="relative flex gap-3">
            {i < items.length - 1 ? <span className="absolute start-3.5 top-8 bottom-[-1rem] w-px bg-border" aria-hidden /> : null}
            <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", d.tone)}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium">{d.title}</p>
              {d.detail ? <p className="mt-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm whitespace-pre-line text-muted-foreground">{d.detail}</p> : null}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.actorName ?? "System"} · {fmt.dateTime(item.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
