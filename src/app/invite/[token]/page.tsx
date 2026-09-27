import type { Metadata } from "next";
import Link from "next/link";
import { Building2, LinkIcon, MailOpen, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthHeading, FormAlert } from "@/components/auth/auth-card";
import { AcceptInvitationButton, InviteSignupForm, SwitchAccountButton } from "@/components/auth/invite-actions";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getInvitationByToken } from "@/services/organization/invitation-service";

export const metadata: Metadata = {
  title: "Accept invitation",
  robots: { index: false },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <div>
        <AuthHeading
          icon={LinkIcon}
          title="This invitation isn't available"
          description="It may have expired, been revoked, or already been used. Ask the person who invited you to send a new invitation."
        />
        <div className="flex flex-col gap-2">
          <Button asChild className="h-10 w-full">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/">Go to homepage</Link>
          </Button>
        </div>
      </div>
    );
  }

  const user = await getSessionUser();
  const orgName = invitation.organization.brandName || invitation.organization.name;
  const inviteePath = `/invite/${encodeURIComponent(token)}`;
  const emailMatches = user ? user.email.toLowerCase() === invitation.email.toLowerCase() : false;

  return (
    <div>
      <AuthHeading
        icon={MailOpen}
        title={`Join ${orgName}`}
        description={
          <>
            <span className="font-medium text-foreground">{invitation.invitedBy.name}</span> invited you to collaborate on{" "}
            {orgName}.
          </>
        }
      />

      <div className="mb-6 rounded-xl border bg-muted/30 p-4 text-sm">
        <dl className="grid gap-3">
          <Detail icon={Building2} label="Organization" value={orgName} />
          <Detail icon={ShieldCheck} label="Role" value={invitation.role.name} />
          <Detail icon={UserRound} label="Invited email" value={invitation.email} />
        </dl>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Invitation expires {formatDate(invitation.expiresAt)}</p>
      </div>

      {user ? (
        emailMatches ? (
          <div className="flex flex-col gap-3">
            <AcceptInvitationButton token={token} />
            <p className="text-center text-xs text-muted-foreground">Signed in as {user.email}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <FormAlert tone="info">
              You&apos;re signed in as <span className="font-medium">{user.email}</span>, but this invitation was sent to{" "}
              <span className="font-medium">{invitation.email}</span>.
            </FormAlert>
            <SwitchAccountButton token={token} email={invitation.email} />
          </div>
        )
      ) : invitation.hasAccount ? (
        <div className="flex flex-col gap-3">
          <Button asChild className="h-10 w-full">
            <Link
              href={`/login?reason=invite&email=${encodeURIComponent(invitation.email)}&callbackUrl=${encodeURIComponent(inviteePath)}`}
            >
              Sign in to accept
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You already have an account for {invitation.email}. You&apos;ll come back here after signing in.
          </p>
        </div>
      ) : (
        <InviteSignupForm token={token} email={invitation.email} />
      )}
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
    </div>
  );
}
