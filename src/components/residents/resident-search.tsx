"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, UserSearch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EnumBadge } from "@/components/shared/status-badge";
import { residentStatusLabels, residentStatusTones } from "@/config/labels";
import type { ResidentStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { useTerms } from "@/components/shared/org-context";
import { searchAssignableResidentsAction } from "@/app/(app)/residents/actions";
import { ResidentAvatar } from "./resident-avatar";

export type ResidentPick = {
  id: string;
  name: string;
  code: string;
  phone: string;
  status: ResidentStatus;
  photoFileId: string | null;
  hostelId: string;
  hostelName: string;
  placement: string | null;
};

/** Debounced resident search for the check-in / check-out wizards. */
export function ResidentSearch({
  mode,
  selected,
  onSelect,
  emptyHint,
}: {
  mode: "check-in" | "check-out";
  selected: ResidentPick | null;
  onSelect: (r: ResidentPick) => void;
  emptyHint?: React.ReactNode;
}) {
  const terms = useTerms();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ResidentPick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(
      () =>
        startTransition(async () => {
          try {
            const res = await searchAssignableResidentsAction(q.trim(), mode);
            if (id !== seq.current) return;
            if (res.ok) {
              setResults(res.data);
              setError(null);
            } else setError(res.error);
          } catch {
            if (id === seq.current) setError("Could not reach the server. Check your connection.");
          }
        }),
      q ? 300 : 0,
    );
    return () => clearTimeout(t);
  }, [q, mode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, code, phone or CNIC"
          className="h-10 ps-8"
          aria-label="Search residents"
          autoFocus
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {results === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          <UserSearch className="size-6" />
          <p>
            {q
              ? `No matching ${terms.residents.toLowerCase()}.`
              : terms.property === "Hostel"
                ? mode === "check-in"
                  ? "No residents are waiting for a bed."
                  : "No residents are currently checked in."
                : mode === "check-in"
                  ? `No ${terms.residents.toLowerCase()} are waiting for a unit.`
                  : `No ${terms.residents.toLowerCase()} are currently moved in.`}
          </p>
          {emptyHint}
        </div>
      ) : (
        <ul className={cn("flex flex-col gap-2 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
          {results.map((r) => {
            const active = selected?.id === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    active ? "border-primary bg-accent/40 ring-1 ring-primary" : "hover:border-primary/40 hover:bg-accent/20",
                  )}
                >
                  <ResidentAvatar name={r.name} photoFileId={r.photoFileId} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.code} · {r.phone}
                      {r.placement ? ` · ${r.placement}` : ` · ${r.hostelName}`}
                    </span>
                  </span>
                  <EnumBadge value={r.status} labels={residentStatusLabels} tones={residentStatusTones} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected && results && !results.some((r) => r.id === selected.id) ? (
        <p className="text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{selected.name}</span> ({selected.code})
        </p>
      ) : null}
    </div>
  );
}
