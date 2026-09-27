"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationCenter() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to load notifications");
      return ((await res.json()) as { data: { items: NotificationItem[]; unread: number } }).data;
    },
  });

  const markRead = async (ids?: string[]) => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const unread = data?.unread ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell />
          {unread > 0 ? (
            <span className="absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 ? (
            <Button variant="ghost" size="xs" onClick={() => markRead()}>
              <CheckCheck />
              Mark all read
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-96">
          {!data?.items.length ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">You’re all caught up.</div>
          ) : (
            <ul className="divide-y">
              {data.items.map((n) => {
                const content = (
                  <div className={cn("flex gap-3 px-4 py-3 text-sm hover:bg-muted/50", !n.readAt && "bg-accent/30")}>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{n.title}</p>
                      {n.body ? <p className="line-clamp-2 text-muted-foreground">{n.body}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">{formatRelative(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => !n.readAt && markRead([n.id])}>
                        {content}
                      </Link>
                    ) : (
                      <button type="button" className="w-full text-start" onClick={() => !n.readAt && markRead([n.id])}>
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
