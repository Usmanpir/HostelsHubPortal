"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters } from "@/components/shared/org-context";
import { generateMonthlyInvoicesAction, previewMonthlyInvoicesAction } from "@/app/(app)/finance/actions";

type Preview = {
  period: string;
  toCreate: number;
  total: number;
  activeAssignments: number;
  alreadyBilled: number;
  zeroRent: number;
  taxRate: number;
  hostels: { hostelId: string; name: string; count: number; total: number }[];
};

const ALL = "__all__";

export function GenerateInvoicesDialog({
  trigger,
  hostels,
  defaultHostelId,
  currentMonth,
  taxRate,
  taxLabel,
}: {
  trigger: React.ReactNode;
  hostels: { id: string; name: string }[];
  defaultHostelId: string | null;
  /** YYYY-MM in the organization's time zone */
  currentMonth: string;
  taxRate: number;
  taxLabel: string;
}) {
  const router = useRouter();
  const fmt = useFormatters();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [hostelId, setHostelId] = useState<string>(defaultHostelId ?? ALL);
  const [applyTax, setApplyTax] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, startPreview] = useTransition();
  const [generating, startGenerate] = useTransition();

  const input = () => {
    const [year, m] = month.split("-").map(Number);
    return { year: year ?? 0, month: m ?? 0, hostelId: hostelId === ALL ? "" : hostelId, applyTax };
  };

  const invalidate = () => setPreview(null);

  const runPreview = () =>
    startPreview(async () => {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        toast.error("Choose a month");
        return;
      }
      const result = await previewMonthlyInvoicesAction(input());
      if (result.ok) setPreview(result.data);
      else toast.error(result.error);
    });

  const runGenerate = () =>
    startGenerate(async () => {
      const result = await generateMonthlyInvoicesAction(input());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { created, skipped } = result.data;
      toast.success(
        created === 0
          ? "No new invoices were needed."
          : `Created ${created} invoice${created === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}`,
      );
      setOpen(false);
      setPreview(null);
      router.refresh();
    });

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (generating) return;
        setOpen(o);
        if (!o) setPreview(null);
      }}
      trigger={trigger}
      title="Generate monthly rent invoices"
      description="Creates one rent invoice per active stay that hasn't been billed for the month. Rent is due on each hostel's rent due day."
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="gen-month">Month</Label>
            <Input
              id="gen-month"
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                invalidate();
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gen-hostel">Hostel</Label>
            <Select
              value={hostelId}
              onValueChange={(v) => {
                setHostelId(v);
                invalidate();
              }}
            >
              <SelectTrigger id="gen-hostel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hostels.length > 1 || !defaultHostelId ? <SelectItem value={ALL}>All hostels in view</SelectItem> : null}
                {hostels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {taxRate > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label htmlFor="gen-tax">
                Apply {taxLabel} ({taxRate}%)
              </Label>
              <p className="text-xs text-muted-foreground">Off by default for rent.</p>
            </div>
            <Switch
              id="gen-tax"
              checked={applyTax}
              onCheckedChange={(v) => {
                setApplyTax(v);
                invalidate();
              }}
            />
          </div>
        ) : null}

        {preview ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4" aria-live="polite">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-muted-foreground">{preview.period}</span>
              <span className="text-xs text-muted-foreground">{preview.activeAssignments} active stays</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Invoices to create</p>
                <p className="text-2xl font-semibold">{preview.toCreate}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total to bill</p>
                <p className="text-2xl font-semibold">{fmt.money(preview.total)}</p>
              </div>
            </div>
            {preview.hostels.length > 1 ? (
              <ul className="divide-y rounded-md border bg-card text-sm">
                {preview.hostels.map((h) => (
                  <li key={h.hostelId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="truncate">{h.name}</span>
                    <span className="tabular shrink-0 text-muted-foreground">
                      {h.count} · {fmt.money(h.total)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {preview.alreadyBilled || preview.zeroRent ? (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Skipping {preview.alreadyBilled ? `${preview.alreadyBilled} already billed` : ""}
                  {preview.alreadyBilled && preview.zeroRent ? " and " : ""}
                  {preview.zeroRent ? `${preview.zeroRent} with no rent set` : ""}.
                </span>
              </p>
            ) : null}
            {preview.toCreate === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" /> Everyone in scope is already billed for this month.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={generating}>
            Cancel
          </Button>
          {preview && preview.toCreate > 0 ? (
            <Button type="button" onClick={runGenerate} disabled={generating}>
              {generating ? <Spinner /> : <CalendarClock />}
              Create {preview.toCreate} invoice{preview.toCreate === 1 ? "" : "s"}
            </Button>
          ) : (
            <Button type="button" onClick={runPreview} disabled={previewing}>
              {previewing ? <Spinner /> : null}
              Preview
            </Button>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
