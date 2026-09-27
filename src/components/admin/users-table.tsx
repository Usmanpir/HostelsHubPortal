"use client";

import { MoreHorizontal, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import type { UserStatus } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { formatDate, formatDateTime } from "@/lib/format";
import { setSuperAdminAction, setUserStatusAction } from "@/app/admin/actions";
import { userStatusLabels, userStatusTones } from "./labels";
import { ControlledConfirm } from "./controlled-confirm";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  isSuperAdmin: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
  memberships: number;
  residentAccounts: number;
  isSelf: boolean;
};

type Pending = { kind: "status" | "admin"; user: UserRow } | null;

function UserActions({ user, onPick }: { user: UserRow; onPick: (p: Pending) => void }) {
  const canDisable = !(user.isSelf && user.status === "ACTIVE");
  const canToggleAdmin = !(user.isSelf && user.isSuperAdmin);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.email}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem disabled={!canDisable} onSelect={() => onPick({ kind: "status", user })}>
          {user.status === "ACTIVE" ? <UserX /> : <UserCheck />}
          {user.status === "ACTIVE" ? "Disable account" : "Enable account"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canToggleAdmin} onSelect={() => onPick({ kind: "admin", user })}>
          {user.isSuperAdmin ? <ShieldOff /> : <ShieldCheck />}
          {user.isSuperAdmin ? "Revoke super admin" : "Grant super admin"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UsersTable({ data, filters }: { data: Paginated<UserRow>; filters: FilterDef[] }) {
  const [pending, setPending] = useState<Pending>(null);
  const columns: Column<UserRow>[] = [
    {
      id: "user",
      header: "User",
      hideable: false,
      cell: (u) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 font-medium">
            {u.name}
            {u.isSelf ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
          </span>
          <span className="truncate text-xs text-muted-foreground">{u.email}</span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (u) => (
        <span className="flex flex-wrap gap-1">
          <EnumBadge value={u.status} labels={userStatusLabels} tones={userStatusTones} />
          {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? <StatusBadge tone="warning">Locked</StatusBadge> : null}
          {!u.emailVerifiedAt ? <StatusBadge tone="neutral" dot={false}>Unverified</StatusBadge> : null}
        </span>
      ),
    },
    {
      id: "role",
      header: "Super admin",
      cell: (u) =>
        u.isSuperAdmin ? (
          <StatusBadge tone="accent">
            <ShieldCheck className="size-3" />
            Super admin
          </StatusBadge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "memberships",
      header: "Memberships",
      align: "end",
      cell: (u) => (
        <span title={u.residentAccounts ? `${u.residentAccounts} resident account(s)` : undefined}>
          {u.memberships}
          {u.residentAccounts ? <span className="text-xs text-muted-foreground"> +{u.residentAccounts} res.</span> : null}
        </span>
      ),
    },
    { id: "lastLogin", header: "Last login", cell: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-muted-foreground">Never</span>) },
    { id: "created", header: "Joined", cell: (u) => formatDate(u.createdAt), defaultHidden: true },
    {
      id: "actions",
      header: "",
      hideable: false,
      hideOnMobile: true,
      align: "end",
      cell: (u) => <UserActions user={u} onPick={setPending} />,
    },
  ];

  const target = pending?.user;
  return (
    <>
      <DataTable
        rows={data.items}
        columns={columns}
        getRowId={(u) => u.id}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        pageSize={data.pageSize}
        searchPlaceholder="Search name or email"
        filters={filters}
        storageKey="admin-users"
        mobileCard={(u) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {u.name} {u.isSelf ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <EnumBadge value={u.status} labels={userStatusLabels} tones={userStatusTones} />
                {u.isSuperAdmin ? <StatusBadge tone="accent">Super admin</StatusBadge> : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {u.memberships} membership{u.memberships === 1 ? "" : "s"} · Last login {u.lastLoginAt ? formatDate(u.lastLoginAt) : "never"}
              </p>
            </div>
            <UserActions user={u} onPick={setPending} />
          </div>
        )}
      />
      {target && pending?.kind === "status" ? (
        <ControlledConfirm
          key={`status-${target.id}`}
          title={target.status === "ACTIVE" ? `Disable ${target.email}?` : `Enable ${target.email}?`}
          description={
            target.status === "ACTIVE"
              ? "They are signed out everywhere immediately and can't sign in until re-enabled."
              : "They'll be able to sign in again. Failed-login locks are cleared."
          }
          confirmLabel={target.status === "ACTIVE" ? "Disable account" : "Enable account"}
          destructive={target.status === "ACTIVE"}
          action={() => setUserStatusAction(target.id, target.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}
          open
          onOpenChange={(o) => !o && setPending(null)}
        />
      ) : null}
      {target && pending?.kind === "admin" ? (
        <ControlledConfirm
          key={`admin-${target.id}`}
          title={target.isSuperAdmin ? `Revoke super admin from ${target.email}?` : `Make ${target.email} a super admin?`}
          description={
            target.isSuperAdmin
              ? "They lose access to this console and are signed out so the change takes effect immediately."
              : "Super admins can manage every organization's plan, status and platform settings."
          }
          confirmLabel={target.isSuperAdmin ? "Revoke access" : "Grant access"}
          destructive={target.isSuperAdmin}
          action={() => setSuperAdminAction(target.id, !target.isSuperAdmin)}
          open
          onOpenChange={(o) => !o && setPending(null)}
        />
      ) : null}
    </>
  );
}
