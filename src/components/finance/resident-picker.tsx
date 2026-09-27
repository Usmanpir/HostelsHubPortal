"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ResidentPickerOption = { id: string; name: string; code: string; hostelName?: string | null };

type Raw = { id?: unknown; name?: unknown; code?: unknown; hostelName?: unknown };

/** Accepts `{ data: [...] }` or a bare array; drops anything that isn't a resident option. */
function parseOptions(json: unknown): ResidentPickerOption[] {
  const list = Array.isArray(json) ? json : Array.isArray((json as { data?: unknown } | null)?.data) ? (json as { data: unknown[] }).data : [];
  return (list as Raw[]).flatMap((r) =>
    typeof r?.id === "string" && typeof r.name === "string"
      ? [{ id: r.id, name: r.name, code: typeof r.code === "string" ? r.code : "", hostelName: typeof r.hostelName === "string" ? r.hostelName : null }]
      : [],
  );
}

const ENDPOINTS = ["/api/residents/options", "/api/finance/residents"] as const;

/**
 * Async resident search. Uses the shared residents picker endpoint and falls
 * back to the finance-only lookup (for roles without resident access).
 */
export function ResidentPicker({
  value,
  onChange,
  disabled,
  invalid,
  placeholder = "Search resident by name, code or phone",
  id,
}: {
  value: ResidentPickerOption | null;
  onChange: (value: ResidentPickerOption | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ResidentPickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpointIndex = useRef(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        for (let i = endpointIndex.current; i < ENDPOINTS.length; i++) {
          const res = await fetch(`${ENDPOINTS[i]}?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
          if (res.ok) {
            endpointIndex.current = i;
            setOptions(parseOptions(await res.json()));
            return;
          }
          if (i === ENDPOINTS.length - 1) {
            const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            throw new Error(body?.error?.message ?? "Could not load residents.");
          }
        }
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load residents.");
        setOptions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

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
            className={cn("h-9 w-full justify-between font-normal", !value && "text-muted-foreground")}
          >
            <span className="flex min-w-0 items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              {value ? (
                <span className="truncate">
                  {value.name}
                  {value.code ? <span className="ms-1.5 font-mono text-xs text-muted-foreground">{value.code}</span> : null}
                </span>
              ) : (
                <span className="truncate">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Type to search…" />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Spinner />
                  Searching…
                </div>
              ) : error ? (
                <div className="px-3 py-6 text-center text-sm text-danger">{error}</div>
              ) : (
                <>
                  <CommandEmpty>{query ? "No residents match your search." : "No residents found."}</CommandEmpty>
                  <CommandGroup>
                    {options.map((o) => (
                      <CommandItem
                        key={o.id}
                        value={o.id}
                        onSelect={() => {
                          onChange(o);
                          setOpen(false);
                        }}
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{o.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[o.code, o.hostelName].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                        <Check className={cn("size-4", value?.id === o.id ? "opacity-100" : "opacity-0")} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && !disabled ? (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear resident">
          <X />
        </Button>
      ) : null}
    </div>
  );
}
