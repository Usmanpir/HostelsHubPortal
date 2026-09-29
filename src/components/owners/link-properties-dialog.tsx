"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { FormDialog } from "@/components/shared/form-dialog";
import { useCan, useTerms } from "@/components/shared/org-context";
import type { LinkableProperty } from "@/services/owners/owner-service";
import { linkablePropertiesAction, setOwnerPropertiesAction } from "@/app/(app)/owners/actions";

type LoadState = { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "ready"; rows: LinkableProperty[] };

/**
 * Choose which properties belong to this owner. Checking a property linked to
 * another owner moves it here; unchecking unlinks it.
 */
export function LinkPropertiesDialog({ ownerId, ownerName, trigger }: { ownerId: string; ownerName: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const terms = useTerms();
  const canCreateProperty = useCan()("hostels.manage");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, startSaving] = useTransition();

  const load = async () => {
    setState({ status: "loading" });
    try {
      const result = await linkablePropertiesAction(ownerId);
      if (result.ok) {
        setState({ status: "ready", rows: result.data });
        setSelected(new Set(result.data.filter((r) => r.linkedHere).map((r) => r.id)));
      } else {
        setState({ status: "error", message: result.error });
      }
    } catch {
      setState({ status: "error", message: "Could not reach the server. Please try again." });
    }
  };

  const onOpenChange = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    if (next) {
      setQuery("");
      void load();
    }
  };

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = () =>
    startSaving(async () => {
      try {
        const result = await setOwnerPropertiesAction(ownerId, { hostelIds: [...selected] });
        if (result.ok) {
          const { linked, unlinked } = result.data;
          toast.success(
            linked + unlinked === 0
              ? "No changes"
              : [linked ? `${linked} linked` : null, unlinked ? `${unlinked} unlinked` : null].filter(Boolean).join(" · "),
          );
          setOpen(false);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  const rows = state.status === "ready" ? state.rows : [];
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => [r.name, r.code, r.city ?? "", r.owner?.name ?? ""].some((v) => v.toLowerCase().includes(q)))
    : rows;
  const moving = rows.filter((r) => selected.has(r.id) && r.owner && !r.linkedHere);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={`Link ${terms.properties.toLowerCase()}`}
      description={`Select the ${terms.properties.toLowerCase()} owned by ${ownerName}. Rent and expenses from these appear on the owner's statements.`}
      className="sm:max-w-xl"
    >
      {state.status === "loading" || state.status === "idle" ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center text-sm">
          <AlertTriangle className="size-5 text-danger" />
          <p>{state.message}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
          <Building2 className="size-5" />
          <p>No active {terms.properties.toLowerCase()} you can access yet.</p>
          {canCreateProperty ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/hostels/new">Add {terms.property.toLowerCase()}</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.length > 6 ? (
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${terms.properties.toLowerCase()}`}
                className="ps-8"
                aria-label={`Search ${terms.properties.toLowerCase()}`}
              />
            </div>
          ) : null}
          <ul className="flex max-h-[50dvh] flex-col divide-y overflow-y-auto rounded-lg border">
            {visible.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
            ) : (
              visible.map((r) => {
                const id = `link-${r.id}`;
                return (
                  <li key={r.id}>
                    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-accent/40">
                      <Checkbox id={id} checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{r.code}</span>
                          {r.city ? ` · ${r.city}` : ""}
                          {r.managementFeePercent !== null ? ` · ${r.managementFeePercent}% fee` : ""}
                        </span>
                      </span>
                      {r.owner && !r.linkedHere ? (
                        <span className="shrink-0 text-xs text-muted-foreground">Owner: {r.owner.name}</span>
                      ) : null}
                    </label>
                  </li>
                );
              })
            )}
          </ul>
          {moving.length > 0 ? (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
              {moving.length} selected {moving.length === 1 ? terms.property.toLowerCase() : terms.properties.toLowerCase()} will move from{" "}
              {[...new Set(moving.map((m) => m.owner!.name))].join(", ")} to {ownerName}.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{selected.size} selected</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={saving || state.status !== "ready"}>
          {saving ? <Spinner /> : null}
          Save
        </Button>
      </div>
    </FormDialog>
  );
}
