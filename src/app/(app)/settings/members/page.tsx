import { Users } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/settings/section-header";
import { InviteMemberDialog } from "@/components/settings/invite-member-dialog";
import { InvitationsList } from "@/components/settings/invitations-list";
import { MembersTable } from "@/components/settings/members-table";
import {
  getMemberFormOptions,
  listMembers,
  listPendingInvitations,
} from "@/services/organization/member-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Team members" };

export default async function MembersPage() {
  const ctx = await requireSettingsPage("settings.members");
  const [{ members }, invitations, options] = await Promise.all([
    listMembers(ctx),
    listPendingInvitations(ctx),
    getMemberFormOptions(ctx),
  ]);
  const active = members.filter((m) => m.status === "ACTIVE").length;
  const suspended = members.filter((m) => m.status === "SUSPENDED").length;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader
          title="Team members"
          description={`${active} active${suspended ? ` · ${suspended} suspended` : ""} · ${invitations.length} pending invitation${invitations.length === 1 ? "" : "s"}`}
          actions={<InviteMemberDialog roles={options.roles} hostels={options.hostels} />}
        />
        {members.length === 0 ? (
          <EmptyState icon={Users} title="No team members yet" description="Invite your managers, wardens and accountants to collaborate." />
        ) : (
          <MembersTable members={members} roles={options.roles} hostels={options.hostels} viewerIsOwner={ctx.isOwner} />
        )}
      </section>

      <section>
        <SectionHeader
          title="Pending invitations"
          description="People who've been invited but haven't joined yet."
        />
        <InvitationsList invitations={invitations} />
      </section>
    </div>
  );
}
