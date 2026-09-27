"use client";

import {
  ArrowRight,
  BedDouble,
  CircleDot,
  ImagePlus,
  ImageMinus,
  MessageSquareText,
  PencilLine,
  PlusCircle,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useFormatters } from "@/components/shared/org-context";
import { complaintStatusLabels, maintenanceStatusLabels } from "@/config/labels";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  action: string;
  createdAt: Date | string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
};

const statusLabels: Record<string, string> = { ...maintenanceStatusLabels, ...complaintStatusLabels };

function pick(meta: Record<string, unknown> | null, side: "before" | "after", key: string): string | null {
  const obj = meta?.[side];
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function describe(item: TimelineItem): { icon: LucideIcon; title: string; detail?: string; tone: string } {
  const verb = item.action.split(".").slice(1).join(".");
  const m = item.metadata;
  switch (verb) {
    case "created":
      return { icon: PlusCircle, title: "Created", tone: "bg-info-soft text-info" };
    case "updated":
      return { icon: PencilLine, title: "Details edited", tone: "bg-muted text-muted-foreground" };
    case "assigned": {
      const to = pick(m, "after", "assignedStaff");
      return { icon: UserPlus, title: to ? `Assigned to ${to}` : "Assigned", tone: "bg-violet-soft text-violet" };
    }
    case "unassigned":
      return { icon: UserMinus, title: "Unassigned", tone: "bg-muted text-muted-foreground" };
    case "status_changed": {
      const from = pick(m, "before", "status");
      const to = pick(m, "after", "status");
      const note = pick(m, "after", "notes") ?? pick(m, "after", "resolution");
      const bed = m?.bedReleased === true ? " · bed back in service" : "";
      return {
        icon: ArrowRight,
        title: `${from ? statusLabels[from] ?? from : "Status"} → ${to ? statusLabels[to] ?? to : "updated"}${bed}`,
        detail: note && note !== pick(m, "before", "notes") && note !== pick(m, "before", "resolution") ? note : undefined,
        tone: to === "COMPLETED" || to === "RESOLVED" ? "bg-success-soft text-success" : to === "REJECTED" || to === "CLOSED" ? "bg-muted text-muted-foreground" : "bg-warning-soft text-warning",
      };
    }
    case "notes_updated":
      return { icon: MessageSquareText, title: "Notes updated", detail: pick(m, "after", "notes") ?? undefined, tone: "bg-muted text-muted-foreground" };
    case "photos_added": {
      const count = typeof m?.count === "number" ? m.count : null;
      return { icon: ImagePlus, title: count ? `${count} photo${count === 1 ? "" : "s"} added` : "Photos added", tone: "bg-muted text-muted-foreground" };
    }
    case "photo_removed":
      return { icon: ImageMinus, title: "Photo removed", tone: "bg-muted text-muted-foreground" };
    default:
      if (item.action.startsWith("bed.")) return { icon: BedDouble, title: "Bed status changed", tone: "bg-muted text-muted-foreground" };
      return { icon: CircleDot, title: item.action, tone: "bg-muted text-muted-foreground" };
  }
}

/** Vertical activity feed built from audit log entries of one record. */
export function ActivityTimeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  const fmt = useFormatters();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className={cn("relative flex flex-col gap-4", className)}>
      {items.map((item, i) => {
        const d = describe(item);
        const Icon = d.icon;
        return (
          <li key={item.id} className="relative flex gap-3">
            {i < items.length - 1 ? <span className="absolute start-3.5 top-8 bottom-[-1rem] w-px bg-border" aria-hidden /> : null}
            <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full", d.tone)}>
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
