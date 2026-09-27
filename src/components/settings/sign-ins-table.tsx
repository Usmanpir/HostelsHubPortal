"use client";

import { Globe, Monitor, Smartphone } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormatters } from "@/components/shared/org-context";

export type SignInRow = {
  id: string;
  createdAt: Date | string;
  ipAddress: string | null;
  userAgent: string | null;
  user: { id: string; name: string; email: string } | null;
};

/** Small, dependency-free user-agent summary ("Chrome on Windows"). */
function describeAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return { label: `${browser} on ${os}`, mobile: /Mobile|Android|iPhone|iPad/.test(ua) };
}

export function SignInsTable({ rows }: { rows: SignInRow[] }) {
  const { dateTime } = useFormatters();
  if (rows.length === 0) {
    return <EmptyState icon={Globe} title="No sign-ins recorded yet" description="Sign-ins by your team will appear here." />;
  }
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Member</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>IP address</TableHead>
              <TableHead className="text-end">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const agent = describeAgent(r.userAgent);
              const Icon = agent.mobile ? Smartphone : Monitor;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.user?.name ?? "Deleted user"}</p>
                    <p className="text-xs text-muted-foreground">{r.user?.email}</p>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-sm" title={r.userAgent ?? undefined}>
                      <Icon className="size-4 text-muted-foreground" />
                      {agent.label}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-end text-sm tabular">{dateTime(r.createdAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => {
          const agent = describeAgent(r.userAgent);
          return (
            <li key={r.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.user?.name ?? "Deleted user"}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.user?.email}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{dateTime(r.createdAt)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {agent.label} · <span className="font-mono">{r.ipAddress ?? "unknown IP"}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
