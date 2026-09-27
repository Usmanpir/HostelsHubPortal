"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { cancelPortalRequestAction } from "@/app/portal/actions";

export function CancelRequestButton({ id }: { id: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive">
          <X />
          Cancel request
        </Button>
      }
      title="Cancel this request?"
      description="The hostel office will no longer see it as pending. You can submit a new one later."
      confirmLabel="Cancel request"
      destructive
      action={() => cancelPortalRequestAction(id)}
    />
  );
}
