"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlState } from "@/hooks/use-url-state";

export function HostelListToolbar() {
  const url = useUrlState();
  const [q, setQ] = useState(url.get("q"));
  useEffect(() => {
    if (q === url.get("q")) return;
    const t = setTimeout(() => url.set({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, code or city" className="ps-8" aria-label="Search hostels" />
      </div>
      <Select value={url.get("status") || "OPEN"} onValueChange={(v) => url.set({ status: v === "OPEN" ? null : v })}>
        <SelectTrigger className="sm:w-44" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="OPEN">Active & inactive</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="INACTIVE">Inactive</SelectItem>
          <SelectItem value="ARCHIVED">Archived</SelectItem>
          <SelectItem value="ALL">All</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
