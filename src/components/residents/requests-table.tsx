"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { TextareaField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { EnumBadge } from "@/components/shared/status-badge";
import { FormDialog } from "@/components/shared/form-dialog";
import { useCan, useFormatters, useTerms } from "@/components/shared/org-context";
import { approvalStatusLabels, approvalStatusTones, residentRequestTypeLabels } from "@/config/labels";
import { requestDecisionSchema } from "@/lib/validation/resident";
import type { listResidentRequests } from "@/services/resident/request-service";
import { decideRequestAction } from "@/app/(app)/residents/actions";

export type RequestsData = Awaited<ReturnType<typeof listResidentRequests>>;
type Row = RequestsData["items"][number];

export function RequestsTable({ data, filters, showHostel, empty }: { data: RequestsData; filters: FilterDef[]; showHostel: boolean; empty?: React.ReactNode }) {
  const fmt = useFormatters();
  const can = useCan();
  const terms = useTerms();
  const canDecide = can("requests.manage");
  const canAssign = can("assignments.manage");
  const [deciding, setDeciding] = useState<{ row: Row; status: "APPROVED" | "REJECTED" } | null>(null);

  const period = (r: Row) =>
    r.startDate ? `${fmt.date(r.startDate)}${r.endDate ? ` – ${fmt.date(r.endDate)}` : ""}` : null;

  const actions = (r: Row) =>
    r.status === "PENDING" && canDecide ? (
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setDeciding({ row: r, status: "REJECTED" })}>
          <X />
          Reject
        </Button>
        <Button size="sm" onClick={() => setDeciding({ row: r, status: "APPROVED" })}>
          <Check />
          Approve
        </Button>
      </div>
    ) : r.status === "APPROVED" && r.type === "ROOM_CHANGE" && canAssign && r.resident.assignments.length > 0 ? (
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href={`/residents/${r.resident.id}?transfer=1`}>
            <ArrowRightLeft />
            Transfer
          </Link>
        </Button>
      </div>
    ) : null;

  const columns: Column<Row>[] = [
    {
      id: "request",
      header: "Request",
      hideable: false,
      cell: (r) => (
        <div className="min-w-0 max-w-md">
          <p className="truncate font-medium">{r.subject}</p>
          <p className="truncate text-xs text-muted-foreground">
            {residentRequestTypeLabels[r.type]}
            {period(r) ? ` · ${period(r)}` : ""}
            {r.details ? ` · ${r.details}` : ""}
          </p>
        </div>
      ),
    },
    {
      id: "resident",
      header: terms.resident,
      cell: (r) => (
        <Link href={`/residents/${r.resident.id}`} className="hover:text-primary">
          <span className="block whitespace-nowrap">
            {r.resident.firstName} {r.resident.lastName}
          </span>
          <span className="block text-xs text-muted-foreground">
            {r.resident.assignments[0]
              ? `${terms.unit} ${r.resident.assignments[0].room.roomNumber}${terms.property === "Hostel" ? ` · Bed ${r.resident.assignments[0].bed.bedNumber}` : ""}`
              : r.resident.residentCode}
          </span>
        </Link>
      ),
    },
    ...(showHostel ? [{ id: "hostel", header: terms.property, cell: (r: Row) => r.hostel.name }] : []),
    { id: "created", header: "Submitted", cell: (r) => <span className="whitespace-nowrap">{fmt.date(r.createdAt)}</span> },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-col items-start gap-0.5">
          <EnumBadge value={r.status} labels={approvalStatusLabels} tones={approvalStatusTones} />
          {r.reviewedBy && r.reviewedAt ? (
            <span className="text-[11px] whitespace-nowrap text-muted-foreground">
              {r.reviewedBy.name} · {fmt.date(r.reviewedAt)}
            </span>
          ) : null}
        </div>
      ),
    },
    { id: "response", header: "Response", defaultHidden: true, cell: (r) => <span className="line-clamp-2 text-muted-foreground">{r.response ?? "—"}</span> },
    { id: "actions", header: "", hideable: false, hideOnMobile: true, cell: actions },
  ];

  return (
    <>
      <DataTable
        rows={data.items}
        columns={columns}
        getRowId={(r) => r.id}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        pageSize={data.pageSize}
        searchPlaceholder="Search subject or resident"
        filters={filters}
        storageKey="resident-requests"
        empty={empty}
        mobileCard={(r) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{r.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {residentRequestTypeLabels[r.type]} · {r.resident.firstName} {r.resident.lastName} · {fmt.date(r.createdAt)}
                </p>
              </div>
              <EnumBadge value={r.status} labels={approvalStatusLabels} tones={approvalStatusTones} />
            </div>
            {period(r) ? <p className="text-xs text-muted-foreground">{period(r)}</p> : null}
            {r.details ? <p className="line-clamp-3 text-sm text-muted-foreground">{r.details}</p> : null}
            {r.response ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Response:</span> {r.response}
              </p>
            ) : null}
            {actions(r)}
          </div>
        )}
      />
      <DecisionDialog key={deciding ? `${deciding.row.id}:${deciding.status}` : "none"} deciding={deciding} onClose={() => setDeciding(null)} />
    </>
  );
}

function DecisionDialog({ deciding, onClose }: { deciding: { row: Row; status: "APPROVED" | "REJECTED" } | null; onClose: () => void }) {
  const router = useRouter();
  const fmt = useFormatters();
  const { form, onSubmit, pending } = useActionForm({
    schema: requestDecisionSchema,
    defaultValues: { status: deciding?.status ?? "APPROVED", response: "" },
    action: (v) => decideRequestAction(deciding!.row.id, v),
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const approving = deciding?.status === "APPROVED";
  const r = deciding?.row;

  return (
    <FormDialog
      open={!!deciding}
      onOpenChange={(o) => !o && !pending && onClose()}
      title={approving ? "Approve request" : "Reject request"}
      description={r ? `${residentRequestTypeLabels[r.type]} from ${r.resident.firstName} ${r.resident.lastName}` : undefined}
    >
      {r ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{r.subject}</p>
            {r.startDate ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fmt.date(r.startDate)}
                {r.endDate ? ` – ${fmt.date(r.endDate)}` : ""}
              </p>
            ) : null}
            {r.details ? <p className="mt-2 whitespace-pre-line text-muted-foreground">{r.details}</p> : null}
          </div>
          <TextareaField
            control={form.control}
            name="response"
            label={approving ? "Message to resident (optional)" : "Reason"}
            required={!approving}
            rows={3}
            placeholder={approving ? "Approved — please collect the new key from reception." : "Explain why the request can't be approved."}
          />
          {approving && r.type === "ROOM_CHANGE" ? (
            <p className="text-xs text-muted-foreground">Approving doesn&apos;t move the resident. Use Transfer afterwards to assign the new bed.</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton pending={pending} variant={approving ? "default" : "destructive"}>
              {approving ? "Approve" : "Reject"}
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </FormDialog>
  );
}
