"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Building2,
  CalendarClock,
  Globe2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import { announcementAudienceLabels, announcementCategoryLabels, announcementCategoryTones } from "@/config/labels";
import type { AnnouncementAudience, AnnouncementCategory } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";
import {
  archiveAnnouncementAction,
  getAnnouncementAction,
  restoreAnnouncementAction,
  setAnnouncementPinnedAction,
} from "@/app/(app)/operations/actions";
import { AnnouncementDialog, type AnnouncementEditable } from "./announcement-dialog";
import type { HostelChoice } from "./maintenance-form";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  hostelId: string | null;
  isPinned: boolean;
  publishedAt: Date | string;
  expiresAt: Date | string | null;
  archivedAt: Date | string | null;
  hostel: { id: string; name: string; code: string } | null;
  createdBy: { id: string; name: string } | null;
  _count: { recipients: number };
  canManage: boolean;
};

function stateOf(a: AnnouncementRow) {
  const now = Date.now();
  if (a.archivedAt) return { label: "Archived", tone: "neutral" as const };
  if (new Date(a.publishedAt).getTime() > now) return { label: "Scheduled", tone: "info" as const };
  if (a.expiresAt && new Date(a.expiresAt).getTime() <= now) return { label: "Expired", tone: "neutral" as const };
  return null;
}

/** Announcements board with create/edit, pin and archive. */
export function AnnouncementList({
  items,
  canPublish,
  hostels,
  allowOrgWide,
  defaultHostelId,
  filtered,
}: {
  items: AnnouncementRow[];
  canPublish: boolean;
  hostels: HostelChoice[];
  allowOrgWide: boolean;
  defaultHostelId?: string | null;
  filtered: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AnnouncementEditable | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AnnouncementRow | null>(null);
  const [pending, startTransition] = useTransition();
  const canCreate = canPublish && (allowOrgWide || hostels.length > 0);

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    startTransition(async () => {
      try {
        const result = await fn();
        if (result.ok) {
          toast.success(result.message ?? "Done");
          after?.();
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  const openEdit = (a: AnnouncementRow) => {
    setLoadingId(a.id);
    startTransition(async () => {
      try {
        const result = await getAnnouncementAction(a.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const d = result.data;
        setEditing({
          id: d.id,
          title: d.title,
          body: d.body,
          category: d.category,
          audience: d.audience,
          hostelId: d.hostelId,
          isPinned: d.isPinned,
          publishedAt: d.publishedAt,
          expiresAt: d.expiresAt,
          recipients: d.recipients.map((r) => ({
            id: r.resident.id,
            name: `${r.resident.firstName} ${r.resident.lastName}`,
            code: r.resident.residentCode,
            hostelId: r.resident.hostelId,
          })),
        });
      } catch {
        toast.error("Could not reach the server. Please try again.");
      } finally {
        setLoadingId(null);
      }
    });
  };

  const newButton = canCreate ? (
    <Button onClick={() => setCreating(true)}>
      <Plus />
      New announcement
    </Button>
  ) : null;

  return (
    <>
      {items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={filtered ? "No announcements match" : "No announcements here"}
          description={canPublish ? "Share notices, rent reminders and emergency alerts with residents and staff." : "Notices from management will appear here."}
          action={filtered ? null : newButton}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <AnnouncementCard
              key={a.id}
              a={a}
              busy={pending && loadingId === a.id}
              onEdit={() => openEdit(a)}
              onPin={() => run(() => setAnnouncementPinnedAction(a.id, !a.isPinned))}
              onArchive={() => setArchiveTarget(a)}
              onRestore={() => run(() => restoreAnnouncementAction(a.id))}
            />
          ))}
        </div>
      )}

      {canCreate ? (
        <AnnouncementDialog open={creating} onOpenChange={setCreating} hostels={hostels} allowOrgWide={allowOrgWide} defaultHostelId={defaultHostelId} />
      ) : null}
      <AnnouncementDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        hostels={hostels}
        allowOrgWide={allowOrgWide}
        announcement={editing ?? undefined}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && !pending && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this announcement?</AlertDialogTitle>
            <AlertDialogDescription>It will be hidden from residents and staff. You can restore it from the Archived tab.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (archiveTarget) run(() => archiveAnnouncementAction(archiveTarget.id), () => setArchiveTarget(null));
              }}
            >
              {pending ? <Spinner /> : null}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Header button that opens the create dialog (rendered in the page header). */
export function NewAnnouncementButton(props: { hostels: HostelChoice[]; allowOrgWide: boolean; defaultHostelId?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!props.allowOrgWide && props.hostels.length === 0) return null;
  return (
    <AnnouncementDialog
      open={open}
      onOpenChange={setOpen}
      {...props}
      trigger={
        <Button>
          <Plus />
          New announcement
        </Button>
      }
    />
  );
}

function AnnouncementCard({
  a,
  busy,
  onEdit,
  onPin,
  onArchive,
  onRestore,
}: {
  a: AnnouncementRow;
  busy: boolean;
  onEdit: () => void;
  onPin: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const fmt = useFormatters();
  const [expanded, setExpanded] = useState(false);
  const state = stateOf(a);
  const long = a.body.length > 280 || a.body.split("\n").length > 5;
  const emergency = a.category === "EMERGENCY";

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        a.isPinned && !a.archivedAt && "border-primary/30 ring-1 ring-primary/10",
        emergency && !a.archivedAt && "border-danger/40",
      )}
    >
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {a.isPinned ? (
              <StatusBadge tone="accent" dot={false}>
                <Pin className="size-3" />
                Pinned
              </StatusBadge>
            ) : null}
            <EnumBadge value={a.category} labels={announcementCategoryLabels} tones={announcementCategoryTones} />
            {state ? <StatusBadge tone={state.tone}>{state.label}</StatusBadge> : null}
          </div>
          <h3 className="text-base leading-snug font-semibold">{a.title}</h3>
        </div>
        {a.canManage ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Announcement actions" disabled={busy}>
                {busy ? <Spinner /> : <MoreHorizontal />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {a.archivedAt ? (
                <DropdownMenuItem onSelect={onRestore}>
                  <ArchiveRestore />
                  Restore
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onPin}>
                    {a.isPinned ? <PinOff /> : <Pin />}
                    {a.isPinned ? "Unpin" : "Pin to top"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onArchive}>
                    <Archive />
                    Archive
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      <div>
        <p className={cn("text-sm whitespace-pre-line text-muted-foreground", !expanded && long && "line-clamp-5")}>{a.body}</p>
        {long ? (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-xs font-medium text-primary hover:underline">
            {expanded ? "Show less" : "Read more"}
          </button>
        ) : null}
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {a.hostel ? <Building2 className="size-3.5" /> : <Globe2 className="size-3.5" />}
          {a.hostel ? a.hostel.name : "All hostels"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" />
          {announcementAudienceLabels[a.audience]}
          {a.audience === "SPECIFIC_RESIDENTS" ? ` (${a._count.recipients})` : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3.5" />
          {fmt.dateTime(a.publishedAt)}
          {a.expiresAt ? ` → ${fmt.dateTime(a.expiresAt)}` : ""}
        </span>
        {a.createdBy ? <span className="ms-auto">by {a.createdBy.name}</span> : null}
      </footer>
    </article>
  );
}
