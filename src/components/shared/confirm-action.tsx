"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

/**
 * Confirmation dialog around a server action. Shows a toast with the result
 * and refreshes server data on success. Optionally collects a reason.
 */
export function ConfirmAction<R>({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  action,
  successMessage,
  onSuccess,
  reason,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  action: (reason?: string) => Promise<ActionResult<R>>;
  successMessage?: string;
  onSuccess?: (data: R) => void;
  /** Ask for a reason (required when `required: true`) */
  reason?: { label: string; required?: boolean; placeholder?: string };
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = () =>
    startTransition(async () => {
      try {
        const result = await action(reason ? text.trim() : undefined);
        if (result.ok) {
          toast.success(successMessage ?? result.message ?? "Done");
          setOpen(false);
          setText("");
          onSuccess?.(result.data);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {reason ? (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="confirm-reason">
              {reason.label}
            </label>
            <Textarea
              id="confirm-reason"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={reason.placeholder}
              rows={3}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending || (!!reason?.required && text.trim().length < 3)}
            onClick={(e) => {
              e.preventDefault();
              run();
            }}
          >
            {pending ? <Spinner /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
