"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Lock, MoreHorizontal, Pencil, ShieldCheck, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { deleteRoleAction } from "@/app/(app)/settings/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { RoleDialog } from "./role-dialog";

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isOwnerRole: boolean;
  permissions: string[];
  memberCount: number;
  pendingInvitations: number;
  isCurrentUserRole: boolean;
};

export function RolesList({
  roles,
  totalPermissions,
  customRolesAllowed,
}: {
  roles: RoleRow[];
  totalPermissions: number;
  customRolesAllowed: boolean;
}) {
  const [duplicating, setDuplicating] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const system = roles.filter((r) => r.isSystem);
  const custom = roles.filter((r) => !r.isSystem);

  const renderGroup = (title: string, list: RoleRow[], empty?: string) => (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.map((role) => {
            const count = role.isOwnerRole ? totalPermissions : role.permissions.length;
            const pct = Math.round((count / totalPermissions) * 100);
            const deletable = !role.isSystem && role.memberCount === 0 && role.pendingInvitations === 0;
            return (
              <li key={role.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    {role.isOwnerRole ? <Lock className="size-4" /> : <ShieldCheck className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/settings/roles/${role.id}`} className="font-medium hover:text-primary">
                        {role.name}
                      </Link>
                      {role.isOwnerRole ? (
                        <StatusBadge tone="accent" dot={false}>
                          Locked
                        </StatusBadge>
                      ) : null}
                      {!role.isSystem ? (
                        <StatusBadge tone="info" dot={false}>
                          Custom
                        </StatusBadge>
                      ) : null}
                      {role.isCurrentUserRole ? (
                        <StatusBadge tone="success" dot={false}>
                          Your role
                        </StatusBadge>
                      ) : null}
                    </div>
                    {role.description ? <p className="mt-0.5 text-sm text-muted-foreground">{role.description}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="tabular">
                          {count} of {totalPermissions} permissions
                        </span>
                      </span>
                      <span className="flex items-center gap-1 tabular">
                        <Users className="size-3.5" />
                        {role.memberCount} member{role.memberCount === 1 ? "" : "s"}
                        {role.pendingInvitations ? ` · ${role.pendingInvitations} invited` : ""}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/settings/roles/${role.id}`}>
                      {role.isOwnerRole ? null : <Pencil />}
                      {role.isOwnerRole ? "View" : "Edit"}
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${role.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem disabled={!customRolesAllowed} onSelect={() => setDuplicating(role)}>
                        <Copy />
                        Duplicate
                      </DropdownMenuItem>
                      {!role.isSystem ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" disabled={!deletable} onSelect={() => setDeleting(role)}>
                            <Trash2 />
                            {deletable ? "Delete role" : role.memberCount > 0 ? "In use — can't delete" : "Invited — can't delete"}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      {renderGroup("Built-in roles", system)}
      {renderGroup(
        "Custom roles",
        custom,
        customRolesAllowed ? "No custom roles yet. Create one or duplicate a built-in role." : "Custom roles aren't available on your plan.",
      )}

      {duplicating ? (
        <RoleDialog
          mode="duplicate"
          source={{ id: duplicating.id, name: duplicating.name }}
          open
          onOpenChange={(o) => !o && setDuplicating(null)}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "role"}?`}
        description="This permanently deletes the role. Members and invitations must be moved to another role first."
        confirmLabel="Delete role"
        destructive
        action={() => deleteRoleAction(deleting!.id)}
      />
    </div>
  );
}
