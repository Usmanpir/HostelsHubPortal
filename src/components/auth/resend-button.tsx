"use client";

import { useEffect, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionResult } from "@/lib/actions";

/**
 * "Resend email" button for check-your-inbox screens. Starts cooled down
 * (an email was just sent) and re-arms after each send so people don't
 * hammer the mailer while waiting for delivery.
 */
export function ResendButton({
  send,
  successMessage,
  cooldownSeconds = 60,
  children = "Resend email",
}: {
  send: () => Promise<ActionResult<null>>;
  successMessage: string;
  cooldownSeconds?: number;
  children?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState(cooldownSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const onClick = () =>
    startTransition(async () => {
      try {
        const result = await send();
        if (result.ok) {
          toast.success(result.message || successMessage);
          setRemaining(cooldownSeconds);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  const waiting = remaining > 0;
  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick} disabled={pending || waiting}>
      {pending ? <Spinner /> : <RotateCcw />}
      {children}
      {waiting ? <span className="text-muted-foreground tabular-nums">in {remaining}s</span> : null}
    </Button>
  );
}
