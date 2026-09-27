"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { restoreStaffAction } from "@/app/(app)/staff/actions";
import { ArchiveStaffDialog } from "./archive-staff-dialog";

export function StaffProfileActions({ staff }: { staff: { id: string; name: string; archived: boolean } }) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  if (staff.archived) {
    return (
      <ConfirmAction
        trigger={
          <Button variant="outline">
            <ArchiveRestore />
            Restore
          </Button>
        }
        title={`Restore ${staff.name}?`}
        description="They will be set to Active and appear again in attendance, payroll and assignment lists."
        confirmLabel="Restore"
        action={restoreStaffAction.bind(null, staff.id)}
      />
    );
  }
  return (
    <>
      <Button asChild variant="outline">
        <Link href={`/staff/${staff.id}/edit`}>
          <Pencil />
          Edit
        </Link>
      </Button>
      <Button variant="ghost" className="text-destructive" onClick={() => setArchiveOpen(true)}>
        <Archive />
        Archive
      </Button>
      <ArchiveStaffDialog staff={{ id: staff.id, name: staff.name }} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
}
