"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  BellRing,
  CalendarCheck,
  CalendarX,
  Ban,
  LogIn,
  LogOut,
  MoreHorizontal,
  Pencil,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { useCan } from "@/components/shared/org-context";
import type {
  AssignmentStatus,
  ResidentStatus,
} from "@/generated/prisma/enums";
import {
  activateReservationAction,
  archiveResidentAction,
  bulkResidentStatusAction,
  cancelReservationAction,
  restoreResidentAction,
} from "@/app/(app)/residents/actions";
import { TransferDialog } from "./transfer-dialog";
import { DateInput } from "./inputs";
import type { AssignableHostel } from "./bed-picker";

export type ResidentHeaderInfo = {
  id: string;
  name: string;
  status: ResidentStatus;
  hostelId: string;
  stay: {
    id: string;
    status: AssignmentStatus;
    bedId: string;
    label: string;
    monthlyRent: number;
    checkInDate: string;
  } | null;
};

/** Header actions on the resident profile: edit, check-in/out, transfer, reservation, status, archive. */
export function ResidentActions({
  resident,
  hostels,
  today,
  openTransfer,
}: {
  resident: ResidentHeaderInfo;
  hostels: AssignableHostel[];
  today: string;
  openTransfer: boolean;
}) {
  const can = useCan();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canManage = can("residents.manage");
  const canAssign = can("assignments.manage");
  const archived = resident.status === "ARCHIVED";
  const stay = resident.stay;

  const setStatus = (
    status: "ACTIVE" | "NOTICE" | "SUSPENDED",
    message: string,
  ) =>
    startTransition(async () => {
      try {
        const res = await bulkResidentStatusAction({
          residentIds: [resident.id],
          status,
        });
        if (res.ok) {
          toast.success(message);
          router.refresh();
        } else toast.error(res.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  const editableStatus =
    resident.status === "ACTIVE" ||
    resident.status === "NOTICE" ||
    resident.status === "SUSPENDED";

  return (
    <>
      {canAssign && !archived ? (
        <>
          {!stay && resident.status !== "SUSPENDED" ? (
            <Button asChild>
              <Link href={`/residents/check-in?residentId=${resident.id}`}>
                <LogIn />
                Check in
              </Link>
            </Button>
          ) : null}
          {stay?.status === "RESERVED" ? (
            <>
              <ActivateReservationDialog assignmentId={stay.id} today={today} />
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <CalendarX />
                    Cancel reservation
                  </Button>
                }
                title="Cancel this reservation?"
                description={`${stay.label} will be released and become available.`}
                confirmLabel="Cancel reservation"
                destructive
                reason={{
                  label: "Reason (optional)",
                  placeholder: "Resident changed plans",
                }}
                action={(reason) =>
                  cancelReservationAction({ assignmentId: stay.id, reason })
                }
              />
            </>
          ) : null}
          {stay?.status === "ACTIVE" ? (
            <>
              <TransferDialog
                defaultOpen={openTransfer}
                resident={{
                  id: resident.id,
                  name: resident.name,
                  hostelId: resident.hostelId,
                  label: stay.label,
                  monthlyRent: stay.monthlyRent,
                  bedId: stay.bedId,
                }}
                hostels={hostels}
                today={today}
                trigger={
                  <Button variant="outline">
                    <ArrowRightLeft />
                    Transfer
                  </Button>
                }
              />
              <Button asChild variant="outline">
                <Link href={`/residents/check-out?residentId=${resident.id}`}>
                  <LogOut />
                  Check out
                </Link>
              </Button>
            </>
          ) : null}
        </>
      ) : null}

      {canManage && !archived ? (
        <Button asChild variant="outline">
          <Link href={`/residents/${resident.id}/edit`}>
            <Pencil />
            Edit
          </Link>
        </Button>
      ) : null}

      {canManage ? (
        archived ? (
          <ConfirmAction
            trigger={
              <Button variant="outline">
                <ArchiveRestore />
                Restore
              </Button>
            }
            title={`Restore ${resident.name}?`}
            description="The resident returns to your lists. They can be checked in again."
            confirmLabel="Restore"
            action={() => restoreResidentAction(resident.id)}
          />
        ) : editableStatus ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="More actions"
                disabled={pending}
              >
                {pending ? <Spinner /> : <MoreHorizontal />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {editableStatus && resident.status !== "NOTICE" ? (
                <DropdownMenuItem
                  onSelect={() => setStatus("NOTICE", "Marked on notice")}
                >
                  <BellRing />
                  Mark on notice
                </DropdownMenuItem>
              ) : null}
              {editableStatus && resident.status !== "ACTIVE" ? (
                <DropdownMenuItem
                  onSelect={() => setStatus("ACTIVE", "Marked active")}
                >
                  <UserCheck />
                  Mark active
                </DropdownMenuItem>
              ) : null}
              {editableStatus && resident.status !== "SUSPENDED" ? (
                <DropdownMenuItem
                  onSelect={() => setStatus("SUSPENDED", "Resident suspended")}
                >
                  <Ban />
                  Suspend
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      ) : null}

      {canManage && !archived && !stay ? (
        <ConfirmAction
          trigger={
            <Button variant="ghost" className="text-destructive">
              <Archive />
              Archive
            </Button>
          }
          title={`Archive ${resident.name}?`}
          description="Archived residents are hidden from day-to-day lists but stay in history, invoices and reports. You can restore them later."
          confirmLabel="Archive"
          destructive
          action={() => archiveResidentAction(resident.id)}
        />
      ) : null}
    </>
  );
}

function ActivateReservationDialog({
  assignmentId,
  today,
}: {
  assignmentId: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [pending, startTransition] = useTransition();
  const future = date > today;

  const submit = () =>
    startTransition(async () => {
      try {
        const res = await activateReservationAction({
          assignmentId,
          checkInDate: date,
        });
        if (res.ok) {
          toast.success(res.message ?? "Checked in");
          setOpen(false);
          router.refresh();
        } else toast.error(res.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="Check in reserved resident"
      description="The reservation becomes an active stay and the bed is marked occupied."
      trigger={
        <Button>
          <CalendarCheck />
          Check in now
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <DateInput
          id="activate-date"
          label="Check-in date"
          value={date}
          onChange={setDate}
          max={today}
          error={future ? "Check-in can't be in the future." : undefined}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || future || !date}>
            {pending ? <Spinner /> : <LogIn />}
            Check in
          </Button>
        </div>
      </div>
    </FormDialog>
  );
}
