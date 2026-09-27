"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Link2, MailWarning, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormatters } from "@/components/shared/org-context";
import { enablePortalAccessAction, resendPortalSetupLinkAction, revokePortalAccessAction } from "@/app/(app)/residents/actions";

export function PortalAccessCard({
  residentId,
  email,
  user,
  canManage,
  archived,
}: {
  residentId: string;
  email: string | null;
  user: { id: string; email: string; lastLoginAt: Date | null } | null;
  canManage: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const fmt = useFormatters();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);

  const run = (fn: () => ReturnType<typeof enablePortalAccessAction>) =>
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) return void toast.error(res.error);
        if (res.data.setupUrl) {
          setLink({ url: res.data.setupUrl, email: res.data.email });
          toast.success(`Setup link emailed to ${res.data.email}`);
        } else {
          toast.success(`Linked to the existing account for ${res.data.email}`);
        }
        router.refresh();
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  const resend = () =>
    startTransition(async () => {
      try {
        const res = await resendPortalSetupLinkAction(residentId);
        if (!res.ok) return void toast.error(res.error);
        setLink({ url: res.data.setupUrl, email: res.data.email });
        toast.success(`New setup link emailed to ${res.data.email}`);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Resident portal</h2>
        {user ? (
          <StatusBadge tone="success">Enabled</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Not enabled</StatusBadge>
        )}
      </div>

      {user ? (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 text-success" />
            <div className="min-w-0">
              <p className="truncate font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                {user.lastLoginAt ? `Last signed in ${fmt.dateTime(user.lastLoginAt)}` : "Hasn't signed in yet"}
              </p>
            </div>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              {!user.lastLoginAt ? (
                <Button size="sm" variant="outline" onClick={resend} disabled={pending}>
                  {pending ? <Spinner /> : <KeyRound />}
                  New setup link
                </Button>
              ) : null}
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={pending}>
                    <UserX />
                    Revoke access
                  </Button>
                }
                title="Revoke portal access?"
                description="The resident can no longer sign in to see invoices, payments or notices. Their login account is kept and can be linked again later."
                confirmLabel="Revoke"
                destructive
                action={() => revokePortalAccessAction(residentId)}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">Residents can view invoices, payments, announcements and raise requests online.</p>
          {!email ? (
            <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <MailWarning className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Add an email address to enable portal access.
                {canManage && !archived ? (
                  <>
                    {" "}
                    <Link href={`/residents/${residentId}/edit`} className="font-medium text-foreground underline underline-offset-4">
                      Edit profile
                    </Link>
                  </>
                ) : null}
              </span>
            </p>
          ) : canManage && !archived ? (
            <Button size="sm" className="self-start" onClick={() => run(() => enablePortalAccessAction(residentId))} disabled={pending}>
              {pending ? <Spinner /> : <Link2 />}
              Enable portal access
            </Button>
          ) : null}
        </div>
      )}

      <SetupLinkDialog link={link} onClose={() => setLink(null)} />
    </section>
  );
}

/** Shown once after provisioning so staff can share the link manually (e.g. over WhatsApp). */
function SetupLinkDialog({ link, onClose }: { link: { url: string; email: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <FormDialog
      open={!!link}
      onOpenChange={(o) => {
        if (!o) {
          setCopied(false);
          onClose();
        }
      }}
      title="Portal access enabled"
      description={link ? `We emailed a password setup link to ${link.email}. You can also share it directly — it works once and expires in 72 hours.` : undefined}
    >
      {link ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input value={link.url} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Setup link" className="font-mono text-xs" />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                  toast.success("Link copied");
                } catch {
                  toast.error("Copy failed — select the link and copy it manually.");
                }
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">For security, this link won&apos;t be shown again. Generate a new one from the portal card if needed.</p>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setCopied(false);
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </FormDialog>
  );
}
