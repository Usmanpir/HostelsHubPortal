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
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { archiveStaffAction } from "@/app/(app)/staff/actions";

/** Archive (soft delete) with the reason the person left. */
export function ArchiveStaffDialog({
  staff,
  open,
  onOpenChange,
  onArchived,
}: {
  staff: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived?: () => void;
}) {
  const [status, setStatus] = useState<"RESIGNED" | "TERMINATED">("RESIGNED");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = () =>
    startTransition(async () => {
      try {
        const result = await archiveStaffAction(staff.id, { status });
        if (result.ok) {
          toast.success(result.message ?? "Staff member archived");
          onOpenChange(false);
          onArchived?.();
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {staff.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Archived staff are hidden from attendance, payroll generation and assignment pickers. Their attendance, leave and
            salary history is kept, and you can restore them at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="archive-status">Reason</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as "RESIGNED" | "TERMINATED")}>
            <SelectTrigger id="archive-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RESIGNED">Resigned</SelectItem>
              <SelectItem value="TERMINATED">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              run();
            }}
          >
            {pending ? <Spinner /> : null}
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
