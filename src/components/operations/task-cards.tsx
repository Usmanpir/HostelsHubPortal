"use client";

import Link from "next/link";
import { Camera, ChevronRight, MapPin, UserRound } from "lucide-react";
import { EnumBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import {
  complaintCategoryLabels,
  complaintStatusLabels,
  complaintStatusTones,
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  maintenanceStatusTones,
  priorityLabels,
  priorityTones,
} from "@/config/labels";
import type { AnnouncementCategory } from "@/generated/prisma/enums";
import { COMPLAINT_ASSIGNEE_TRANSITIONS, MAINTENANCE_WORKER_TRANSITIONS } from "@/lib/validation/operations";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MaintenanceStatusButtons } from "./maintenance-actions";
import { ComplaintStatusButtons } from "./complaint-actions";
import { locationLabel, type MaintenanceRow } from "./maintenance-table";
import type { ComplaintRow } from "./complaints-table";

export type TaskMaintenance = MaintenanceRow & { resolutionNotes: string | null };
export type TaskComplaint = ComplaintRow & { resolution: string | null };

function urgentRing(priority: string) {
  return priority === "URGENT" ? "border-danger/40" : priority === "HIGH" ? "border-warning/40" : "";
}

/** A maintenance job on the My tasks page with one-tap progress buttons. */
export function MaintenanceTaskCard({ task, canWork, showHostel }: { task: TaskMaintenance; canWork: boolean; showHostel: boolean }) {
  const allowed = canWork ? MAINTENANCE_WORKER_TRANSITIONS[task.status] : [];
  const done = task.status === "COMPLETED" || task.status === "REJECTED";
  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", urgentRing(task.priority), done && "opacity-70")}>
      <Link href={`/operations/maintenance/${task.id}`} className="group flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <EnumBadge value={task.status} labels={maintenanceStatusLabels} tones={maintenanceStatusTones} />
            <EnumBadge value={task.priority} labels={priorityLabels} tones={priorityTones} />
          </div>
          <h3 className="font-medium group-hover:text-primary">{task.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{task.requestNumber}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {locationLabel(task)}
              {showHostel ? ` · ${task.hostel.name}` : ""}
            </span>
            <span>{maintenanceCategoryLabels[task.category]}</span>
            {task._count.photos ? (
              <span className="inline-flex items-center gap-0.5">
                <Camera className="size-3" />
                {task._count.photos}
              </span>
            ) : null}
            <span>· {formatRelative(task.createdAt)}</span>
          </p>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
      </Link>
      {allowed.length ? (
        <MaintenanceStatusButtons
          requestId={task.id}
          status={task.status}
          allowed={allowed}
          notes={task.resolutionNotes}
          size="lg"
          className="grid grid-cols-1 gap-2 sm:flex"
        />
      ) : null}
    </article>
  );
}

/** A complaint assigned to the staff member. */
export function ComplaintTaskCard({ task, showHostel }: { task: TaskComplaint; showHostel: boolean }) {
  const allowed = COMPLAINT_ASSIGNEE_TRANSITIONS[task.status];
  const done = task.status === "RESOLVED" || task.status === "CLOSED";
  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", urgentRing(task.priority), done && "opacity-70")}>
      <Link href={`/operations/complaints/${task.id}`} className="group flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <EnumBadge value={task.status} labels={complaintStatusLabels} tones={complaintStatusTones} />
            <EnumBadge value={task.priority} labels={priorityLabels} tones={priorityTones} />
          </div>
          <h3 className="font-medium group-hover:text-primary">{task.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{task.complaintNumber}</span>
            <span>{complaintCategoryLabels[task.category]}</span>
            {task.resident ? (
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3" />
                {task.resident.firstName} {task.resident.lastName}
              </span>
            ) : null}
            {showHostel ? <span>· {task.hostel.name}</span> : null}
            <span>· {formatRelative(task.createdAt)}</span>
          </p>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
      </Link>
      {allowed.length ? (
        <ComplaintStatusButtons
          complaintId={task.id}
          status={task.status}
          allowed={allowed}
          resolution={task.resolution}
          size="lg"
          className="grid grid-cols-1 gap-2 sm:flex"
        />
      ) : null}
    </article>
  );
}

export type TaskAnnouncement = {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  isPinned: boolean;
  publishedAt: Date | string;
  hostel: { name: string } | null;
};

export function PublishedAt({ value }: { value: Date | string }) {
  const fmt = useFormatters();
  return <span title={fmt.dateTime(value)}>{formatRelative(value)}</span>;
}
