"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Copy, Info, Lock, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormGrid, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { StatusBadge } from "@/components/shared/status-badge";
import { PERMISSION_GROUPS } from "@/lib/permissions/catalog";
import { ADMIN_PERMISSIONS, roleSchema } from "@/lib/validation/settings";
import { cn } from "@/lib/utils";
import { deleteRoleAction, updateRoleAction } from "@/app/(app)/settings/actions";
import { RoleDialog } from "./role-dialog";
import { SettingsPanel } from "./section-header";

type RoleDetail = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isOwnerRole: boolean;
  defaultAllHostels: boolean;
  permissions: string[];
  members: { id: string; name: string; email: string; status: string }[];
  memberCount: number;
  pendingInvitations: number;
  isCurrentUserRole: boolean;
};

type LockReason = "owner" | "self" | "not-held" | null;

export function RolePermissionEditor({
  role,
  isOwner,
  heldPermissions,
  customRolesAllowed,
}: {
  role: RoleDetail;
  isOwner: boolean;
  heldPermissions: string[];
  customRolesAllowed: boolean;
}) {
  const router = useRouter();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const locked = role.isOwnerRole;
  const initialPermissions = useMemo(() => new Set(role.permissions), [role.permissions]);
  const held = useMemo(() => new Set(heldPermissions), [heldPermissions]);

  const { form, onSubmit, pending } = useActionForm({
    schema: roleSchema,
    defaultValues: {
      name: role.name,
      description: role.description ?? "",
      defaultAllHostels: role.defaultAllHostels,
      permissions: role.permissions,
    },
    action: (values) => updateRoleAction(role.id, values),
    onSuccess: () => {
      form.reset(form.getValues());
      router.refresh();
    },
  });
  const c = form.control;
  const watched = useWatch({ control: c, name: "permissions" });
  const selected = useMemo(() => new Set(watched ?? []), [watched]);

  const lockOf = (key: string): LockReason => {
    if (locked) return "owner";
    if (role.isCurrentUserRole && key === "settings.roles") return "self";
    // Non-owners can't newly grant admin permissions they don't hold (removing is fine).
    if (!isOwner && (ADMIN_PERMISSIONS as readonly string[]).includes(key) && !held.has(key) && !initialPermissions.has(key)) {
      return "not-held";
    }
    return null;
  };

  const setPermissions = (next: Set<string>) =>
    form.setValue("permissions", [...next], { shouldDirty: true, shouldValidate: true });

  const toggle = (key: string, on: boolean) => {
    if (lockOf(key)) return;
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    setPermissions(next);
  };

  const toggleGroup = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    for (const key of keys) {
      if (lockOf(key)) continue;
      if (on) next.add(key);
      else next.delete(key);
    }
    setPermissions(next);
  };

  const dirty = form.formState.isDirty;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4" noValidate>
        {locked ? (
          <div className="flex items-start gap-3 rounded-xl border border-violet/20 bg-violet-soft p-4 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0 text-violet" />
            <p>
              <span className="font-medium">This role is locked.</span>{" "}
              <span className="text-muted-foreground">
                Owners always have full access so the organization can never be locked out.
              </span>
            </p>
          </div>
        ) : null}

        <SettingsPanel title="Details">
          <fieldset disabled={locked || pending} className="grid gap-4">
            <FormGrid>
              <TextField control={c} name="name" label="Role name" required />
              <SwitchField
                control={c}
                name="defaultAllHostels"
                label="All hostels by default"
                description="Pre-selected when inviting with this role."
              />
            </FormGrid>
            <TextareaField control={c} name="description" label="Description" rows={2} />
          </fieldset>
        </SettingsPanel>

        <SettingsPanel
          title="Permissions"
          description={`${locked ? PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0) : selected.size} selected`}
        >
          <div className="flex flex-col gap-5">
            {PERMISSION_GROUPS.map((group) => {
              const keys = group.permissions.map((p) => p.key as string);
              const on = locked ? keys.length : keys.filter((k) => selected.has(k)).length;
              const state = on === 0 ? false : on === keys.length ? true : "indeterminate";
              const groupLocked = keys.every((k) => lockOf(k) !== null);
              return (
                <fieldset key={group.key} className="flex flex-col gap-2">
                  <legend className="sr-only">{group.label}</legend>
                  <div className="flex items-center gap-2 border-b pb-2">
                    <Checkbox
                      id={`group-${group.key}`}
                      checked={state}
                      disabled={groupLocked || pending}
                      onCheckedChange={() => toggleGroup(keys, state !== true)}
                      className="data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/40"
                      aria-label={`Toggle all ${group.label} permissions`}
                    />
                    <label htmlFor={`group-${group.key}`} className="flex-1 text-sm font-semibold">
                      {group.label}
                    </label>
                    <span className="text-xs text-muted-foreground tabular">
                      {on}/{keys.length}
                    </span>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {group.permissions.map((p) => {
                      const lock = lockOf(p.key);
                      const checked = locked || selected.has(p.key);
                      const id = `perm-${p.key.replace(/\W/g, "-")}`;
                      return (
                        <div
                          key={p.key}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors",
                            !lock && "hover:bg-muted/60",
                            checked && !locked && initialPermissions.has(p.key) !== checked && "bg-info-soft/60",
                            !checked && initialPermissions.has(p.key) && !locked && "bg-warning-soft/60",
                          )}
                        >
                          <Checkbox
                            id={id}
                            checked={checked}
                            disabled={!!lock || pending}
                            onCheckedChange={(v) => toggle(p.key, v === true)}
                            className="mt-0.5"
                          />
                          <label htmlFor={id} className={cn("min-w-0 flex-1 text-sm", lock ? "cursor-not-allowed" : "cursor-pointer")}>
                            <span className="block">{p.label}</span>
                            <span className="block font-mono text-[11px] text-muted-foreground">{p.key}</span>
                            {lock === "self" ? (
                              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Info className="size-3" />
                                Can&apos;t be removed from your own role
                              </span>
                            ) : lock === "not-held" ? (
                              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Lock className="size-3" />
                                Only members who have this permission can grant it
                              </span>
                            ) : null}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </SettingsPanel>

        {!locked ? (
          <div
            className={cn(
              "sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur transition-opacity sm:flex-row sm:items-center",
              dirty ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden={!dirty}
          >
            <p className="flex-1 text-sm text-muted-foreground">
              Unsaved changes — they apply to {role.memberCount} member{role.memberCount === 1 ? "" : "s"} when saved.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => form.reset()} tabIndex={dirty ? 0 : -1}>
                Discard
              </Button>
              <SubmitButton pending={pending}>Save role</SubmitButton>
            </div>
          </div>
        ) : null}
      </form>

      <aside className="flex flex-col gap-4">
        <SettingsPanel
          title="Members"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings/members">Manage</Link>
            </Button>
          }
        >
          {role.members.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />
              No members have this role.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {role.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  {m.status !== "ACTIVE" ? (
                    <StatusBadge tone="warning">{m.status === "SUSPENDED" ? "Suspended" : "Invited"}</StatusBadge>
                  ) : null}
                </li>
              ))}
              {role.memberCount > role.members.length ? (
                <li className="text-xs text-muted-foreground">and {role.memberCount - role.members.length} more</li>
              ) : null}
            </ul>
          )}
          {role.pendingInvitations ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {role.pendingInvitations} pending invitation{role.pendingInvitations === 1 ? "" : "s"}
            </p>
          ) : null}
        </SettingsPanel>

        <SettingsPanel title="Actions">
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              disabled={!customRolesAllowed}
              onClick={() => setDuplicateOpen(true)}
            >
              <Copy />
              Duplicate role
            </Button>
            {!customRolesAllowed ? (
              <p className="text-xs text-muted-foreground">Duplicating creates a custom role, which your plan doesn&apos;t include.</p>
            ) : null}
            {!role.isSystem ? (
              <ConfirmAction
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    className="justify-start"
                    disabled={role.memberCount > 0 || role.pendingInvitations > 0}
                  >
                    <Trash2 />
                    Delete role
                  </Button>
                }
                title={`Delete ${role.name}?`}
                description="This permanently deletes the custom role."
                confirmLabel="Delete role"
                destructive
                action={() => deleteRoleAction(role.id)}
                onSuccess={() => router.push("/settings/roles")}
              />
            ) : null}
            {!role.isSystem && (role.memberCount > 0 || role.pendingInvitations > 0) ? (
              <p className="text-xs text-muted-foreground">
                Move members and revoke pending invitations using this role before deleting it.
              </p>
            ) : null}
          </div>
        </SettingsPanel>
      </aside>

      <RoleDialog mode="duplicate" source={{ id: role.id, name: role.name }} open={duplicateOpen} onOpenChange={setDuplicateOpen} />
    </div>
  );
}
