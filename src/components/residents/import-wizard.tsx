"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet, FileUp, RotateCcw, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import {
  IMPORT_BATCH_SIZE,
  IMPORT_COLUMNS,
  type ImportRowResult,
  type PreviewRow,
} from "@/lib/validation/resident-import";

type Preview = {
  fileName: string;
  rows: PreviewRow[];
  unknownHeaders: string[];
  counts: { total: number; ready: number; duplicate: number; invalid: number };
};

type Filter = "all" | "ready" | "duplicate" | "invalid";
const PAGE = 100;

const STATUS_BADGE: Record<PreviewRow["status"], { tone: "success" | "warning" | "danger"; label: string }> = {
  ready: { tone: "success", label: "Ready" },
  duplicate: { tone: "warning", label: "Duplicate" },
  invalid: { tone: "danger", label: "Error" },
};

const OUTCOME_LABEL: Record<ImportRowResult["outcome"], string> = {
  imported: "Imported",
  skipped: "Skipped (invalid)",
  duplicate: "Skipped (duplicate)",
  failed: "Failed",
};

async function api<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message: string } } | null;
  if (!res.ok || !json || json.data === undefined) throw new Error(json?.error?.message ?? "Something went wrong. Please try again.");
  return json.data;
}

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise formulas, but keep phone numbers like "+92 300 …" re-uploadable.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s()-]+$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Error report: every row that wasn't imported, with the reason and the original values. */
function downloadErrorReport(rows: PreviewRow[], results: Map<number, ImportRowResult>, fileName: string) {
  const problems = rows.filter((r) => results.get(r.rowNumber)?.outcome !== "imported");
  const header = ["Row", "Outcome", "Reason", ...IMPORT_COLUMNS.map((c) => c.header)];
  const lines = [header.map(csvCell).join(",")];
  for (const r of problems) {
    const result = results.get(r.rowNumber);
    const outcome = result ? OUTCOME_LABEL[result.outcome] : STATUS_BADGE[r.status].label;
    const reason = result?.message ?? r.errors.join(" ");
    lines.push([r.rowNumber, outcome, reason, ...IMPORT_COLUMNS.map((c) => r.data[c.key] ?? "")].map(csvCell).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `import-errors-${fileName.replace(/\.[^.]+$/, "")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ResidentImportWizard({ canAssignBeds }: { canAssignBeds: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Map<number, ImportRowResult> | null>(null);

  const reset = () => {
    setPreview(null);
    setResults(null);
    setFilter("all");
    setLimit(PAGE);
    setProgress(0);
    if (input.current) input.current.value = "";
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      setPreview(await api<Preview>("/api/residents/import/preview", { method: "POST", body }));
      setResults(null);
      setFilter("all");
      setLimit(PAGE);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const runImport = async () => {
    if (!preview) return;
    const ready = preview.rows.filter((r) => r.status === "ready");
    setImporting(true);
    setProgress(0);
    const collected = new Map<number, ImportRowResult>();
    // Rows that weren't ready are reported from the preview.
    for (const r of preview.rows) {
      if (r.status === "duplicate") collected.set(r.rowNumber, { rowNumber: r.rowNumber, outcome: "duplicate", message: r.errors[0] ?? "Duplicate" });
      if (r.status === "invalid") collected.set(r.rowNumber, { rowNumber: r.rowNumber, outcome: "skipped", message: r.errors.join(" ") });
    }
    try {
      for (let i = 0; i < ready.length; i += IMPORT_BATCH_SIZE) {
        const batch = ready.slice(i, i + IMPORT_BATCH_SIZE).map(({ rowNumber, data }) => ({ rowNumber, data }));
        try {
          const batchResults = await api<ImportRowResult[]>("/api/residents/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: batch }),
          });
          for (const r of batchResults) collected.set(r.rowNumber, r);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Request failed";
          for (const r of batch) collected.set(r.rowNumber, { rowNumber: r.rowNumber, outcome: "failed", message });
        }
        setProgress(Math.round((Math.min(i + IMPORT_BATCH_SIZE, ready.length) / ready.length) * 100));
      }
      setResults(collected);
      const imported = [...collected.values()].filter((r) => r.outcome === "imported").length;
      toast.success(`${imported} resident${imported === 1 ? "" : "s"} imported`);
      router.refresh();
    } finally {
      setImporting(false);
    }
  };

  const counts = useMemo(() => {
    if (!results) return null;
    const all = [...results.values()];
    const n = (o: ImportRowResult["outcome"]) => all.filter((r) => r.outcome === o).length;
    return { imported: n("imported"), skipped: n("skipped"), duplicate: n("duplicate"), failed: n("failed") };
  }, [results]);

  // ── Step 1: upload ──────────────────────────────────────────────────────
  if (!preview) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border bg-card p-5">
          <input ref={input} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void upload(e.dataTransfer.files?.[0]);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors hover:border-primary/40 hover:bg-accent/20 disabled:opacity-60"
          >
            {uploading ? <Spinner className="size-6" /> : <FileUp className="size-8 text-muted-foreground" />}
            <span className="text-base font-medium">{uploading ? "Checking your file…" : "Drop your Excel or CSV file here"}</span>
            <span className="text-sm text-muted-foreground">or click to choose · .xlsx or .csv · up to 2,000 residents · 5 MB</span>
          </button>
          <p className="mt-4 text-sm text-muted-foreground">
            You&apos;ll see a preview of every row before anything is saved. Duplicates and rows with errors are skipped and listed in a downloadable report.
          </p>
        </section>

        <aside className="flex flex-col gap-3 rounded-xl border bg-card p-5 text-sm">
          <h2 className="font-semibold">1. Start from the template</h2>
          <p className="text-muted-foreground">It has every supported column, an example row and an Instructions sheet listing your hostel codes.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/residents/import/template?format=xlsx" download>
                <FileSpreadsheet />
                Excel template
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/residents/import/template?format=csv" download>
                <Download />
                CSV template
              </a>
            </Button>
          </div>
          <h2 className="mt-2 font-semibold">2. Required columns</h2>
          <p className="text-muted-foreground">
            {IMPORT_COLUMNS.filter((c) => c.required)
              .map((c) => c.header)
              .join(", ")}
            .
          </p>
          <h2 className="mt-2 font-semibold">3. Beds (optional)</h2>
          <p className="text-muted-foreground">
            {canAssignBeds
              ? "Fill Room and Bed to check residents straight into an available bed. Rent defaults to the bed, room or hostel rent."
              : "Your role can add residents but not assign beds — leave Room and Bed empty."}
          </p>
        </aside>
      </div>
    );
  }

  const visible = preview.rows.filter((r) => filter === "all" || r.status === filter);
  const name = (r: PreviewRow) => `${r.data.firstName ?? ""} ${r.data.lastName ?? ""}`.trim() || "—";

  // ── Step 3: results ─────────────────────────────────────────────────────
  if (results && counts) {
    const problems = counts.skipped + counts.duplicate + counts.failed;
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Imported" value={counts.imported} icon={CheckCircle2} tone="success" />
          <StatCard label="Duplicates skipped" value={counts.duplicate} icon={Copy} tone="warning" />
          <StatCard label="Invalid skipped" value={counts.skipped} icon={AlertTriangle} tone="warning" />
          <StatCard label="Failed" value={counts.failed} icon={XCircle} tone="danger" />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
          <p className="me-auto text-sm">
            {problems
              ? `${problems} row${problems === 1 ? "" : "s"} weren't imported. Download the report, fix them and upload just those rows again.`
              : "Every row was imported."}
          </p>
          {problems ? (
            <Button variant="outline" onClick={() => downloadErrorReport(preview.rows, results, preview.fileName)}>
              <Download />
              Download error report
            </Button>
          ) : null}
          <Button variant="outline" onClick={reset}>
            <RotateCcw />
            Import another file
          </Button>
          <Button asChild>
            <Link href="/residents">View residents</Link>
          </Button>
        </div>
        <ResultTable rows={preview.rows} results={results} name={name} />
      </div>
    );
  }

  // ── Step 2: preview ─────────────────────────────────────────────────────
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All rows", count: preview.counts.total },
    { key: "ready", label: "Ready", count: preview.counts.ready },
    { key: "duplicate", label: "Duplicates", count: preview.counts.duplicate },
    { key: "invalid", label: "Errors", count: preview.counts.invalid },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="me-auto min-w-0">
          <p className="truncate font-medium">{preview.fileName}</p>
          <p className="text-sm text-muted-foreground">
            {preview.counts.ready} of {preview.counts.total} rows are ready to import. Nothing has been saved yet.
          </p>
          {preview.unknownHeaders.length ? (
            <p className="mt-1 text-xs text-warning">Ignored columns: {preview.unknownHeaders.join(", ")}</p>
          ) : null}
        </div>
        <Button variant="outline" onClick={reset} disabled={importing}>
          <Upload />
          Choose another file
        </Button>
        <Button onClick={runImport} disabled={importing || preview.counts.ready === 0}>
          {importing ? <Spinner /> : <CheckCircle2 />}
          Import {preview.counts.ready} resident{preview.counts.ready === 1 ? "" : "s"}
        </Button>
      </div>
      {importing ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm">Importing… {progress}%</p>
          <Progress value={progress} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setFilter(t.key);
              setLimit(PAGE);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filter === t.key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} <span className="tabular opacity-80">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-16">Row</TableHead>
              <TableHead>Resident</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-64">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.slice(0, limit).map((r) => (
              <TableRow key={r.rowNumber}>
                <TableCell className="tabular text-muted-foreground">{r.rowNumber}</TableCell>
                <TableCell>
                  <p className="font-medium">{name(r)}</p>
                  <p className="text-xs text-muted-foreground">{r.data.phone ?? ""}</p>
                </TableCell>
                <TableCell className="text-sm">{r.placement ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS_BADGE[r.status].tone}>{STATUS_BADGE[r.status].label}</StatusBadge>
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {r.errors.length ? (
                    <ul className="flex flex-col gap-0.5 text-danger">
                      {r.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  ) : null}
                  {r.warnings.length ? <p className="text-warning">{r.warnings.join(" ")}</p> : null}
                  {!r.errors.length && !r.warnings.length ? <span className="text-muted-foreground">Looks good</span> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No rows in this view.</p> : null}
      </div>
      {visible.length > limit ? (
        <Button variant="outline" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({visible.length - limit} remaining)
        </Button>
      ) : null}
    </div>
  );
}

function ResultTable({ rows, results, name }: { rows: PreviewRow[]; results: Map<number, ImportRowResult>; name: (r: PreviewRow) => string }) {
  const [limit, setLimit] = useState(PAGE);
  const tone = (o: ImportRowResult["outcome"]) => (o === "imported" ? "success" : o === "failed" ? "danger" : "warning");
  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-16">Row</TableHead>
              <TableHead>Resident</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="min-w-64">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((r) => {
              const result = results.get(r.rowNumber);
              if (!result) return null;
              return (
                <TableRow key={r.rowNumber}>
                  <TableCell className="tabular text-muted-foreground">{r.rowNumber}</TableCell>
                  <TableCell>
                    {result.residentId ? (
                      <Link href={`/residents/${result.residentId}`} className="font-medium hover:text-primary">
                        {name(r)}
                      </Link>
                    ) : (
                      <span className="font-medium">{name(r)}</span>
                    )}
                    {result.residentCode ? <p className="text-xs text-muted-foreground">{result.residentCode}</p> : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={tone(result.outcome)}>{OUTCOME_LABEL[result.outcome]}</StatusBadge>
                  </TableCell>
                  <TableCell className={cn("text-sm whitespace-normal", result.outcome !== "imported" && "text-danger")}>{result.message}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > limit ? (
        <Button variant="outline" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({rows.length - limit} remaining)
        </Button>
      ) : null}
    </>
  );
}
