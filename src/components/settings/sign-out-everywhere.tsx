"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { signOutAllSessionsAction } from "@/app/(app)/settings/actions";

export function SignOutEverywhere() {
  return (
    <ConfirmAction
      trigger={
        <Button variant="outline" className="shrink-0">
          <LogOut />
          Sign out of all devices
        </Button>
      }
      title="Sign out of all devices?"
      description="Every session on every device — including this browser — ends immediately. You'll need to sign in again."
      confirmLabel="Sign out everywhere"
      destructive
      action={() => signOutAllSessionsAction()}
      onSuccess={(data) => window.location.assign(data.redirectTo)}
    />
  );
}
