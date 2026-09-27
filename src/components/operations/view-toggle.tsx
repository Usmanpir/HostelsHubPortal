"use client";

import { Columns3, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUrlState } from "@/hooks/use-url-state";

/** List ↔ board switch stored in the URL (?view=board). */
export function ViewToggle() {
  const url = useUrlState();
  const view = url.get("view") === "board" ? "board" : "list";
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={view}
      onValueChange={(v) => v && url.set({ view: v === "board" ? "board" : null, status: null, page: null })}
      aria-label="View"
    >
      <ToggleGroupItem value="list" aria-label="List view">
        <List />
        <span className="hidden sm:inline">List</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="board" aria-label="Board view">
        <Columns3 />
        <span className="hidden sm:inline">Board</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
