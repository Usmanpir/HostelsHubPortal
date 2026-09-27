"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { setActiveHostelAction } from "@/app/(app)/shell-actions";
import { cn } from "@/lib/utils";

export type HostelOption = { id: string; name: string; code: string; city: string | null };

/**
 * Global hostel filter. Stored in an httpOnly cookie and validated on the
 * server; every list/dashboard query reads it from the TenantContext.
 */
export function HostelSwitcher({
  hostels,
  activeHostelId,
  allowAll,
  className,
}: {
  hostels: HostelOption[];
  activeHostelId: string | null;
  allowAll: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = hostels.find((h) => h.id === activeHostelId);

  const choose = (id: string | null) =>
    startTransition(async () => {
      const result = await setActiveHostelAction(id);
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });

  if (hostels.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-8 max-w-60 justify-between gap-2 px-2.5", className)} aria-label="Switch hostel">
          {pending ? <Spinner /> : active ? <Building2 className="text-muted-foreground" /> : <Layers className="text-muted-foreground" />}
          <span className="truncate">{active?.name ?? "All hostels"}</span>
          <ChevronsUpDown className="ms-auto text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Viewing</DropdownMenuLabel>
        {allowAll ? (
          <DropdownMenuItem onSelect={() => choose(null)}>
            <Layers />
            <span className="flex-1">All hostels</span>
            {!activeHostelId ? <Check className="text-primary" /> : null}
          </DropdownMenuItem>
        ) : null}
        {allowAll ? <DropdownMenuSeparator /> : null}
        {hostels.map((h) => (
          <DropdownMenuItem key={h.id} onSelect={() => choose(h.id)}>
            <Building2 />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{h.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {h.code}
                {h.city ? ` · ${h.city}` : ""}
              </span>
            </div>
            {h.id === activeHostelId ? <Check className="text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
