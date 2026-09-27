"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, ChevronDown, Clock, Save, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/shared/status-badge";
import { attendanceStatusLabels, leaveTypeLabels, staffTypeLabels } from "@/config/labels";
import type { AttendanceStatus, LeaveType, StaffType } from "@/generated/prisma/enums";
import { ATTENDANCE_STATUSES } from "@/lib/validation/staff";
import { cn } from "@/lib/utils";
import { saveAttendanceAction } from "@/app/(app)/staff/actions";
import { StaffAvatar } from "./staff-avatar";
import { attendanceCellClasses, attendanceSoftClasses } from "./staff-format";

export type SheetRow = {
  staffId: string;
  name: string;
  employeeCode: string;
  designation: StaffType;
  photoFileId: string | null;
  primaryHostel: { id: string; name: string } | null;
  record: {
    status: AttendanceStatus;
    checkInTime: string | null;
    checkOutTime: string | null;
    notes: string | null;
    markedBy: string | null;
  } | null;
  approvedLeave: { id: string; type: LeaveType } | null;
};

type Entry = {
  status: AttendanceStatus | null;
  checkInTime: string;
  checkOutTime: string;
  notes: string;
  /** Pre-selected from approved leave, not yet saved. */
  suggested: boolean;
};

const SHORT: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEAVE: "Leave",
  HALF_DAY: "Half",
};

function initialEntry(row: SheetRow): Entry {
  if (row.record) {
    return {
      status: row.record.status,
      checkInTime: row.record.checkInTime ?? "",
      checkOutTime: row.record.checkOutTime ?? "",
      notes: row.record.notes ?? "",
      suggested: false,
    };
  }
  return { status: row.approvedLeave ? "LEAVE" : null, checkInTime: "", checkOutTime: "", notes: "", suggested: !!row.approvedLeave };
}

function sameAsSaved(row: SheetRow, e: Entry) {
  const r = row.record;
  if (!r) return e.status === null;
  return (
    r.status === e.status &&
    (r.checkInTime ?? "") === e.checkInTime &&
    (r.checkOutTime ?? "") === e.checkOutTime &&
    (r.notes ?? "") === e.notes.trim()
  );
}

export function AttendanceSheet({
  date,
  hostelId,
  rows,
  readOnly,
}: {
  date: string;
  hostelId: string | null;
  rows: SheetRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(rows.map((r) => [r.staffId, initialEntry(r)])),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const dirtyIds = useMemo(
    () => rows.filter((r) => entries[r.staffId]!.status !== null && !sameAsSaved(r, entries[r.staffId]!)).map((r) => r.staffId),
    [rows, entries],
  );
  const dirty = dirtyIds.length > 0;

  // Warn before leaving with unsaved marks.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, HALF_DAY: 0 };
    let marked = 0;
    for (const r of rows) {
      const s = entries[r.staffId]!.status;
      if (s) {
        c[s]++;
        marked++;
      }
    }
    return { ...c, marked };
  }, [rows, entries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q));
  }, [rows, query]);

  const update = (staffId: string, patch: Partial<Entry>) =>
    setEntries((prev) => ({ ...prev, [staffId]: { ...prev[staffId]!, ...patch, suggested: false } }));

  const markAllPresent = () =>
    setEntries((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        // People on approved leave keep their leave mark.
        if (r.approvedLeave) continue;
        next[r.staffId] = { ...next[r.staffId]!, status: "PRESENT", suggested: false };
      }
      return next;
    });

  const reset = () => setEntries(Object.fromEntries(rows.map((r) => [r.staffId, initialEntry(r)])));

  const save = () =>
    startTransition(async () => {
      try {
        const result = await saveAttendanceAction({
          date,
          hostelId: hostelId ?? undefined,
          entries: dirtyIds.map((staffId) => {
            const e = entries[staffId]!;
            return {
              staffId,
              status: e.status!,
              checkInTime: e.checkInTime || undefined,
              checkOutTime: e.checkOutTime || undefined,
              notes: e.notes.trim() || undefined,
            };
          }),
        });
        if (result.ok) {
          toast.success(`Attendance saved for ${result.data.saved} staff member${result.data.saved === 1 ? "" : "s"}`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Your marks are still here — try again.");
      }
    });

  const unmarked = rows.length - counts.marked;

  return (
    <div className="flex flex-col gap-3">
      {/* Summary + bulk actions */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="me-1 font-medium tabular">
            {counts.marked}/{rows.length} marked
          </span>
          {ATTENDANCE_STATUSES.map((s) =>
            counts[s] ? (
              <span key={s} className={cn("rounded-md px-2 py-0.5 text-xs font-medium tabular", attendanceSoftClasses[s])}>
                {attendanceStatusLabels[s]} {counts[s]}
              </span>
            ) : null,
          )}
        </div>
        <div className="flex flex-col gap-2 sm:ms-auto sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find staff" className="h-9 ps-8 sm:w-44" aria-label="Find staff" />
          </div>
          {!readOnly ? (
            <Button variant="outline" size="lg" onClick={markAllPresent} disabled={pending}>
              <CheckCheck />
              Mark all present
            </Button>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card py-10 text-center text-sm text-muted-foreground">No staff match “{query}”.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((row) => {
            const e = entries[row.staffId]!;
            const isOpen = expanded.has(row.staffId);
            const changed = e.status !== null && !sameAsSaved(row, e);
            return (
              <li key={row.staffId} className={cn("rounded-xl border bg-card p-3 transition-colors", changed && "border-primary/40")}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
                    <StaffAvatar name={row.name} photoFileId={row.photoFileId} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {staffTypeLabels[row.designation]} · <span className="font-mono">{row.employeeCode}</span>
                        {row.primaryHostel ? ` · ${row.primaryHostel.name}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="grid flex-1 grid-cols-5 gap-1.5" role="radiogroup" aria-label={`Attendance for ${row.name}`}>
                    {ATTENDANCE_STATUSES.map((s) => {
                      const active = e.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={readOnly || pending}
                          onClick={() => update(row.staffId, { status: s })}
                          className={cn(
                            "flex h-11 items-center justify-center rounded-lg border text-xs font-medium transition-all select-none sm:text-sm",
                            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed",
                            active ? cn("border-transparent shadow-sm", attendanceCellClasses[s]) : "bg-background text-muted-foreground hover:bg-muted",
                            active && e.suggested && "opacity-80 ring-2 ring-info/40 ring-offset-1",
                            !active && readOnly && "opacity-60",
                          )}
                        >
                          <span className="sm:hidden">{SHORT[s]}</span>
                          <span className="hidden sm:inline">{attendanceStatusLabels[s]}</span>
                        </button>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start lg:self-center"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.staffId)) next.delete(row.staffId);
                        else next.add(row.staffId);
                        return next;
                      })
                    }
                    aria-expanded={isOpen}
                  >
                    <Clock />
                    {e.checkInTime || e.checkOutTime ? `${e.checkInTime || "—"} – ${e.checkOutTime || "—"}` : "Times & notes"}
                    <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} />
                  </Button>
                </div>

                {row.approvedLeave || row.record?.markedBy || changed ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {row.approvedLeave ? (
                      <StatusBadge tone="info">On approved {leaveTypeLabels[row.approvedLeave.type].toLowerCase()} leave</StatusBadge>
                    ) : null}
                    {e.suggested ? <span>Leave pre-selected — save to confirm.</span> : null}
                    {changed && !e.suggested ? <span className="text-primary">Unsaved change</span> : null}
                    {row.record?.markedBy && !changed ? <span>Marked by {row.record.markedBy}</span> : null}
                  </div>
                ) : null}

                {isOpen ? (
                  <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-[140px_140px_1fr]">
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Check-in
                      <Input
                        type="time"
                        value={e.checkInTime}
                        disabled={readOnly || pending}
                        onChange={(ev) => update(row.staffId, { checkInTime: ev.target.value, status: e.status ?? "PRESENT" })}
                        className="h-10"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Check-out
                      <Input
                        type="time"
                        value={e.checkOutTime}
                        disabled={readOnly || pending}
                        onChange={(ev) => update(row.staffId, { checkOutTime: ev.target.value, status: e.status ?? "PRESENT" })}
                        className="h-10"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Notes
                      <Input
                        value={e.notes}
                        maxLength={300}
                        disabled={readOnly || pending}
                        placeholder="e.g. Covered night shift"
                        onChange={(ev) => update(row.staffId, { notes: ev.target.value })}
                        className="h-10"
                      />
                    </label>
                    {!e.status && !readOnly ? (
                      <p className="text-xs text-warning sm:col-span-3">Choose a status to save times or notes.</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-xl sm:border">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {dirty
                ? `${dirtyIds.length} change${dirtyIds.length === 1 ? "" : "s"} to save`
                : unmarked > 0
                  ? `${unmarked} not marked yet`
                  : "Everyone is marked"}
            </p>
            {dirty ? (
              <Button variant="ghost" size="lg" onClick={reset} disabled={pending}>
                <Undo2 />
                <span className="hidden sm:inline">Discard</span>
              </Button>
            ) : null}
            <Button size="lg" onClick={save} disabled={!dirty || pending} className="min-w-32">
              {pending ? <Spinner /> : <Save />}
              {pending ? "Saving…" : "Save attendance"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
