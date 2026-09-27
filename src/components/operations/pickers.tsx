"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, UserRound, X } from "lucide-react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { assignableStaffAction, maintenanceLocationsAction } from "@/app/(app)/operations/actions";

// ─── Residents ──────────────────────────────────────────────────────────────

export type ResidentOption = { id: string; name: string; code: string; hostelId: string };

function toResidentOptions(json: unknown): ResidentOption[] {
  const data = (json as { data?: unknown } | null)?.data;
  const list = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown } | null)?.items) ? (data as { items: unknown[] }).items : [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string") return [];
    const name =
      typeof r.name === "string" ? r.name : [r.firstName, r.lastName].filter((v): v is string => typeof v === "string").join(" ");
    const code = typeof r.code === "string" ? r.code : typeof r.residentCode === "string" ? r.residentCode : "";
    return [{ id: r.id, name: name || "Unnamed resident", code, hostelId: typeof r.hostelId === "string" ? r.hostelId : "" }];
  });
}

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Search residents via /api/residents/options; optionally narrowed to one hostel. */
export function useResidentSearch(query: string, hostelId?: string | null, enabled = true, activeOnly = false) {
  const q = useDebounced(query.trim());
  return useQuery({
    queryKey: ["resident-options", q, hostelId ?? "", activeOnly],
    enabled,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (hostelId) params.set("hostelId", hostelId);
      if (activeOnly) params.set("active", "1");
      const res = await fetch(`/api/residents/options?${params.toString()}`, { signal, headers: { Accept: "application/json" } });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: { message?: string } } | null)?.error?.message;
        throw new Error(message ?? "Could not load residents");
      }
      const options = toResidentOptions(json);
      return hostelId ? options.filter((o) => !o.hostelId || o.hostelId === hostelId) : options;
    },
  });
}

function ResidentList({
  hostelId,
  selectedIds,
  onPick,
  open,
  activeOnly,
}: {
  hostelId?: string | null;
  selectedIds: string[];
  onPick: (r: ResidentOption) => void;
  open: boolean;
  activeOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const search = useResidentSearch(query, hostelId, open, activeOnly);
  return (
    <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search name, code or phone…" />
      <CommandList>
        {search.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner />
            Searching…
          </div>
        ) : search.isError ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{search.error.message}</div>
        ) : (
          <>
            <CommandEmpty>{query ? "No residents match." : "No residents found."}</CommandEmpty>
            <CommandGroup>
              {(search.data ?? []).map((r) => (
                <CommandItem key={r.id} value={r.id} onSelect={() => onPick(r)}>
                  <Check className={cn("size-4", selectedIds.includes(r.id) ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {r.code ? <span className="font-mono text-xs text-muted-foreground">{r.code}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}

/** Single resident combobox. `value` is the id; `selected` keeps the label for display. */
export function ResidentPicker({
  value,
  selected,
  onChange,
  hostelId,
  disabled,
  placeholder = "Select a resident (optional)",
  invalid,
  id,
  activeOnly,
}: {
  value: string | undefined;
  selected: ResidentOption | null;
  onChange: (resident: ResidentOption | null) => void;
  hostelId?: string | null;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  activeOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = value && selected?.id === value ? selected : null;
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            disabled={disabled}
            className="h-9 min-w-0 flex-1 justify-between font-normal"
          >
            <span className={cn("flex min-w-0 items-center gap-2 truncate", !label && "text-muted-foreground")}>
              <UserRound className="size-4 shrink-0 opacity-60" />
              {label ? (
                <span className="truncate">
                  {label.name}
                  {label.code ? <span className="ms-1.5 font-mono text-xs text-muted-foreground">{label.code}</span> : null}
                </span>
              ) : (
                placeholder
              )}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <ResidentList
            open={open}
            hostelId={hostelId}
            activeOnly={activeOnly}
            selectedIds={value ? [value] : []}
            onPick={(r) => {
              onChange(r.id === value ? null : r);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {label && !disabled ? (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear resident">
          <X />
        </Button>
      ) : null}
    </div>
  );
}

/** RHF-bound single resident field. */
export function ResidentField<T extends FieldValues>({
  control,
  name,
  label = "Resident",
  description,
  hostelId,
  selected,
  onSelectedChange,
  disabled,
  required,
  activeOnly,
}: {
  control: Control<T, unknown, FieldValues> | Control<T>;
  name: FieldPath<T>;
  label?: string;
  description?: string;
  hostelId?: string | null;
  selected: ResidentOption | null;
  onSelectedChange: (r: ResidentOption | null) => void;
  disabled?: boolean;
  required?: boolean;
  /** Hide checked-out residents */
  activeOnly?: boolean;
}) {
  const id = `field-${name.replace(/\W/g, "-")}`;
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>
            {label}
            {required ? <span className="text-destructive">*</span> : null}
          </FieldLabel>
          <ResidentPicker
            id={id}
            value={(field.value as string | undefined) || undefined}
            selected={selected}
            hostelId={hostelId}
            activeOnly={activeOnly}
            disabled={disabled || !hostelId}
            placeholder={hostelId ? "Select a resident (optional)" : "Pick a hostel first"}
            invalid={fieldState.invalid}
            onChange={(r) => {
              onSelectedChange(r);
              field.onChange(r?.id ?? "");
            }}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

/** Multi-select residents (for targeted announcements). */
export function ResidentMultiPicker({
  value,
  onChange,
  hostelId,
  invalid,
}: {
  value: ResidentOption[];
  onChange: (residents: ResidentOption[]) => void;
  hostelId?: string | null;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ids = value.map((r) => r.id);
  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid} className="h-9 justify-between font-normal">
            <span className="text-muted-foreground">{value.length ? `${value.length} selected — add more` : "Search and select residents"}</span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <ResidentList
            open={open}
            hostelId={hostelId}
            activeOnly
            selectedIds={ids}
            onPick={(r) => onChange(ids.includes(r.id) ? value.filter((v) => v.id !== r.id) : [...value, r])}
          />
        </PopoverContent>
      </Popover>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 ps-2.5 pe-1 text-xs">
              {r.name}
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => onChange(value.filter((v) => v.id !== r.id))}
                aria-label={`Remove ${r.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Staff & locations ──────────────────────────────────────────────────────

export type StaffOption = { id: string; name: string; designation: string; onLeave: boolean };

/** Staff assigned to a hostel who can take maintenance / complaints. */
export function useAssignableStaff(hostelId: string | null | undefined) {
  return useQuery({
    queryKey: ["assignable-staff", hostelId ?? ""],
    enabled: !!hostelId,
    queryFn: async (): Promise<StaffOption[]> => {
      const result = await assignableStaffAction(hostelId!);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
}

export type LocationRoom = {
  id: string;
  roomNumber: string;
  floorName: string;
  beds: { id: string; bedNumber: string; status: string }[];
};

export function useHostelLocations(hostelId: string | null | undefined) {
  return useQuery({
    queryKey: ["maintenance-locations", hostelId ?? ""],
    enabled: !!hostelId,
    queryFn: async (): Promise<LocationRoom[]> => {
      const result = await maintenanceLocationsAction(hostelId!);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
}
