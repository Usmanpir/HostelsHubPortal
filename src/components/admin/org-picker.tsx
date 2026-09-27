"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { searchOrganizationsAction } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

export type OrgOption = { id: string; name: string; slug: string };

/** Searchable organization picker backed by a server action (super admins only). */
export function OrgPicker({ value, onChange, id }: { value: OrgOption | null; onChange: (org: OrgOption | null) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["admin-org-search", term],
    enabled: open,
    queryFn: async () => {
      const result = await searchOrganizationsAction(term);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? value.name : "Select organization…"}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,360px)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search name or slug…" />
          <CommandList>
            {isFetching ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner /> Searching…
              </div>
            ) : isError ? (
              <div className="py-6 text-center text-sm text-destructive">Couldn&apos;t load organizations.</div>
            ) : (
              <>
                <CommandEmpty>No organizations found.</CommandEmpty>
                <CommandGroup>
                  {(data ?? []).map((o) => (
                    <CommandItem
                      key={o.id}
                      value={o.id}
                      onSelect={() => {
                        onChange({ id: o.id, name: o.name, slug: o.slug });
                        setOpen(false);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{o.name}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">{o.slug}</span>
                      </div>
                      {value?.id === o.id ? <Check className="text-primary" /> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
