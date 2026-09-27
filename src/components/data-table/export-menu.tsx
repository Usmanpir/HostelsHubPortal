"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Download the current (filtered) list. `endpoint` is an export route such as
 * /api/reports/residents; current URL filters are forwarded.
 */
export function ExportMenu({ endpoint, extraParams }: { endpoint: string; extraParams?: Record<string, string> }) {
  const searchParams = useSearchParams();
  const href = (format: "csv" | "xlsx") => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("pageSize");
    for (const [k, v] of Object.entries(extraParams ?? {})) params.set(k, v);
    params.set("format", format);
    return `${endpoint}?${params.toString()}`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={href("csv")} download>
            <FileText />
            CSV
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href("xlsx")} download>
            <FileSpreadsheet />
            Excel (.xlsx)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
