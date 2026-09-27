"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, DoorOpen, FileText, MessageSquareWarning, Receipt, Search, UserCog, Users, Wrench } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SearchGroup } from "@/services/search/search-service";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  residents: Users,
  staff: UserCog,
  rooms: DoorOpen,
  beds: BedDouble,
  invoices: FileText,
  payments: Receipt,
  complaints: MessageSquareWarning,
  maintenance: Wrench,
};

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function GlobalSearch({ placeholder }: { placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 250);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", q],
    enabled: open && q.length >= 2,
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed");
      return ((await res.json()) as { data: SearchGroup[] }).data;
    },
  });

  return (
    <>
      <Button
        variant="outline"
        className="h-8 w-full justify-start gap-2 px-2.5 font-normal text-muted-foreground sm:w-56 lg:w-72"
        onClick={() => setOpen(true)}
      >
        <Search />
        <span className="truncate">{placeholder}</span>
        <kbd className="ms-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search across your organization">
        <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
        <CommandList>
          {q.length < 2 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</div>
          ) : isFetching && !data ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <>
              <CommandEmpty>No results for “{q}”.</CommandEmpty>
              {(data ?? []).map((group) => {
                const Icon = ICONS[group.key] ?? Search;
                return (
                  <CommandGroup key={group.key} heading={group.label}>
                    {group.results.map((r) => (
                      <CommandItem
                        key={`${group.key}-${r.id}`}
                        value={`${group.key}-${r.id}`}
                        onSelect={() => {
                          setOpen(false);
                          setQuery("");
                          router.push(r.href);
                        }}
                      >
                        <Icon className="text-muted-foreground" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{r.title}</span>
                          {r.subtitle ? <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span> : null}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
