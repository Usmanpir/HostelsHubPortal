"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Crown, KeyRound, MoreHorizontal, PauseCircle, PlayCircle, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog } from "@/components/shared/form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import type { Tone } from "@/config/labels";
import type { MemberStatus } from "@/generated/prisma/enums";
import { initials } from "@/lib/format";
import { memberAccessSchema } from "@/lib/validation/settings";
import {
  changeMemberRoleAction,
  removeMemberAction,
  setMemberStatusAction,
  updateMemberAccessAction,
} from "@/app/(app)/settings/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { HostelAccessPicker, type HostelAccessValue, type HostelOption } from "./hostel-access-picker";
import type { RoleOption } from "./invite-member-dialog";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  lastLoginAt: Date | string | null;
  status: MemberStatus;
  isOwner: boolean;
  isSelf: boolean;
  allHostels: boolean;
  hostels: { id: string; name: string; code: string }[];
  archivedHostelIds: string[];
  role: { id: string; name: string; isOwnerRole: boolean };
  joinedAt: Date | string;
};

const statusLabels: Record<MemberStatus, string> = { ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended" };
const statusTones: Record<MemberStatus, Tone> = { ACTIVE: "success", INVITED: "info", SUSPENDED: "danger" };

type Dialog =
  | { kind: "role"; member: MemberRow }
  | { kind: "access"; member: MemberRow }
  | { kind: "status"; member: MemberRow }
  | { kind: "remove"; member: MemberRow }
  | null;

export function MembersTable({
  members,
  roles,
  hostels,
  viewerIsOwner,
}: {
  members: MemberRow[];
  roles: RoleOption[];
  hostels: HostelOption[];
  viewerIsOwner: boolean;
}) {
  const { date, dateTime } = useFormatters();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const access = (m: MemberRow) =>
    m.allHostels ? (
      <span className="text-sm">All hostels</span>
    ) : m.hostels.length === 0 ? (
      <span className="text-sm text-warning">No hostels</span>
    ) : (
      <span className="text-sm" title={m.hostels.map((h) => h.name).join(", ")}>
        {m.hostels.length === 1 ? m.hostels[0]!.name : `${m.hostels.length} hostels`}
      </span>
    );

  const actions = (m: MemberRow) => {
    const canChangeRole = viewerIsOwner || (!m.isOwner && !m.isSelf);
    const canChangeAccess = !m.isOwner;
    const canChangeStatus = !m.isOwner && !m.isSelf && m.status !== "INVITED";
    const canRemove = !m.isOwner && !m.isSelf;
    if (!canChangeRole && !canChangeAccess && !canChangeStatus && !canRemove) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${m.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate">{m.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canChangeRole} onSelect={() => setDialog({ kind: "role", member: m })}>
            <KeyRound />
            Change role
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canChangeAccess} onSelect={() => setDialog({ kind: "access", member: m })}>
            <Building2 />
            Hostel access
          </DropdownMenuItem>
          {canChangeStatus ? (
            <DropdownMenuItem onSelect={() => setDialog({ kind: "status", member: m })}>
              {m.status === "SUSPENDED" ? <PlayCircle /> : <PauseCircle />}
              {m.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
            </DropdownMenuItem>
          ) : null}
          {canRemove ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "remove", member: m })}>
                <UserMinus />
                Remove from organization
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const identity = (m: MemberRow) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(m.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-medium">
          {m.name}
          {m.isOwner ? <Crown className="size-3.5 shrink-0 text-warning" aria-label="Owner" /> : null}
          {m.isSelf ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Hostel access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="max-w-72">{identity(m)}</TableCell>
                <TableCell>{m.role.name}</TableCell>
                <TableCell>{access(m)}</TableCell>
                <TableCell>
                  <StatusBadge tone={statusTones[m.status]}>{statusLabels[m.status]}</StatusBadge>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{date(m.joinedAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.lastLoginAt ? `Last sign-in ${dateTime(m.lastLoginAt)}` : "Never signed in"}
                  </p>
                </TableCell>
                <TableCell className="text-end">{actions(m)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {members.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              {identity(m)}
              {actions(m)}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Role</dt>
                <dd>{m.role.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge tone={statusTones[m.status]}>{statusLabels[m.status]}</StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hostel access</dt>
                <dd>{access(m)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Joined</dt>
                <dd>{date(m.joinedAt)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      {dialog?.kind === "role" ? (
        <MemberRoleDialog member={dialog.member} roles={roles} onClose={close} />
      ) : null}
      {dialog?.kind === "access" ? (
        <MemberAccessDialog member={dialog.member} hostels={hostels} onClose={close} />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === "status"}
        onOpenChange={(o) => !o && close()}
        title={
          dialog?.kind === "status"
            ? dialog.member.status === "SUSPENDED"
              ? `Reactivate ${dialog.member.name}?`
              : `Suspend ${dialog.member.name}?`
            : ""
        }
        description={
          dialog?.kind === "status" && dialog.member.status === "SUSPENDED"
            ? "They'll regain access with their current role and hostel access."
            : "They'll immediately lose access to this organization until reactivated. Their history is kept."
        }
        confirmLabel={dialog?.kind === "status" && dialog.member.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
        destructive={dialog?.kind === "status" && dialog.member.status !== "SUSPENDED"}
        action={() => {
          const m = (dialog as { member: MemberRow }).member;
          return setMemberStatusAction(m.id, { status: m.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" });
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "remove"}
        onOpenChange={(o) => !o && close()}
        title={dialog?.kind === "remove" ? `Remove ${dialog.member.name}?` : ""}
        description="They'll lose access to this organization. Their user account and everything they recorded stays intact. You can invite them again later."
        confirmLabel="Remove member"
        destructive
        action={() => removeMemberAction((dialog as { member: MemberRow }).member.id)}
      />
    </>
  );
}

function MemberRoleDialog({ member, roles, onClose }: { member: MemberRow; roles: RoleOption[]; onClose: () => void }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(member.role.id);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      try {
        const result = await changeMemberRoleAction(member.id, { roleId });
        if (result.ok) {
          toast.success(result.message ?? "Role updated");
          onClose();
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  return (
    <FormDialog open onOpenChange={(o) => !o && !pending && onClose()} title={`Change role for ${member.name}`} description="The new permissions apply immediately.">
      <RadioGroup value={roleId} onValueChange={setRoleId} className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
        {roles.map((r) => (
          <Label
            key={r.id}
            htmlFor={`role-${r.id}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-primary/5"
          >
            <RadioGroupItem id={`role-${r.id}`} value={r.id} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{r.name}</span>
              {r.description ? <span className="block text-sm text-muted-foreground">{r.description}</span> : null}
            </span>
          </Label>
        ))}
      </RadioGroup>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending || roleId === member.role.id}>
          {pending ? <Spinner /> : null}
          Save role
        </Button>
      </div>
    </FormDialog>
  );
}

function MemberAccessDialog({ member, hostels, onClose }: { member: MemberRow; hostels: HostelOption[]; onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState<HostelAccessValue>({
    allHostels: member.allHostels,
    hostelIds: member.hostels.map((h) => h.id),
  });
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const save = () => {
    const parsed = memberAccessSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    const payload = parsed.data.allHostels
      ? parsed.data
      : { allHostels: false, hostelIds: [...new Set([...parsed.data.hostelIds, ...member.archivedHostelIds])] };
    startTransition(async () => {
      try {
        const result = await updateMemberAccessAction(member.id, payload);
        if (result.ok) {
          toast.success(result.message ?? "Hostel access updated");
          onClose();
          router.refresh();
        } else {
          setError(result.fieldErrors?.hostelIds?.[0]);
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={`Hostel access for ${member.name}`}
      description="Members only see residents, rooms, finance and operations for hostels they can access."
    >
      <HostelAccessPicker
        hostels={hostels}
        value={value}
        onChange={(v) => {
          setValue(v);
          if (error) setError(undefined);
        }}
        error={error}
        disabled={pending}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Spinner /> : null}
          Save access
        </Button>
      </div>
    </FormDialog>
  );
}
