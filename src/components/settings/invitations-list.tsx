"use client";

import { Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { useFormatters } from "@/components/shared/org-context";
import { revokeInvitationAction } from "@/app/(app)/settings/actions";

export type InvitationRow = {
  id: string;
  email: string;
  role: { id: string; name: string };
  allHostels: boolean;
  hostels: { id: string; name: string }[];
  invitedBy: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  /** Whole days until the invitation expires (computed on the server). */
  daysLeft: number;
};

export function InvitationsList({ invitations }: { invitations: InvitationRow[] }) {
  const { date } = useFormatters();
  if (invitations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No pending invitations.
      </p>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {invitations.map((inv) => {
        const { daysLeft } = inv;
        return (
          <li key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
                <Mail className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{inv.email}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.role.name} ·{" "}
                  {inv.allHostels
                    ? "All hostels"
                    : inv.hostels.length === 1
                      ? inv.hostels[0]!.name
                      : `${inv.hostels.length} hostels`}{" "}
                  · Invited by {inv.invitedBy} on {date(inv.createdAt)} ·{" "}
                  <span className={daysLeft <= 1 ? "text-warning" : undefined}>
                    {daysLeft === 0 ? "expires today" : `expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                  </span>
                </p>
              </div>
            </div>
            <ConfirmAction
              trigger={
                <Button size="sm" variant="ghost" className="self-end text-destructive sm:self-center">
                  <X />
                  Revoke
                </Button>
              }
              title={`Revoke invitation for ${inv.email}?`}
              description="The invitation link will stop working. You can send a new invitation at any time."
              confirmLabel="Revoke"
              destructive
              action={() => revokeInvitationAction(inv.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}
