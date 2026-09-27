/**
 * Serializable report output shared by the report pages (rendered generically
 * by src/components/reports), the JSON API and the CSV/XLSX export.
 */
import type { Tone } from "@/config/labels";
import type { RangePreset } from "./range";

export type CellFormat = "text" | "money" | "number" | "percent" | "date" | "datetime" | "badge" | "days" | "hours";
export type CellValue = string | number | null;

export type ReportColumn = {
  key: string;
  header: string;
  format?: CellFormat;
  align?: "start" | "end";
  /** Row field holding an in-app link for this cell. */
  hrefKey?: string;
  /** For badge cells: value → label / tone. */
  labels?: Record<string, string>;
  tones?: Record<string, Tone>;
  /** Row field rendered as a muted second line under the value. */
  subKey?: string;
  hideOnMobile?: boolean;
  defaultHidden?: boolean;
};

export type ReportRow = { id: string } & Record<string, CellValue | undefined>;

export type StatFormat = "money" | "number" | "percent" | "days" | "hours";

export type ReportStat = {
  label: string;
  value: number | null;
  format: StatFormat;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

/** column = vertical bars, bar = horizontal bars (categories), stacked = stacked columns. */
export type ChartKind = "column" | "stacked" | "line" | "bar";

export type ChartSeries = { key: string; label: string };

export type ReportChart = {
  id: string;
  title: string;
  description?: string;
  kind: ChartKind;
  xKey: string;
  xFormat?: "month" | "day" | "text";
  series: ChartSeries[];
  data: Record<string, string | number>[];
  format: "money" | "number" | "percent";
  span?: "full" | "half";
};

export type ReportBreakdown = {
  id: string;
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow;
};

export type ReportSummary = {
  stats: ReportStat[];
  charts: ReportChart[];
  breakdowns: ReportBreakdown[];
  /** Context line such as "As of 27 Sep 2026". */
  note?: string;
};

export type ReportRows = {
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  total: number;
};

export type ReportTable = ReportRows & { page: number; pageSize: number; pageCount: number };

export type ReportResult = ReportSummary & {
  table: ReportTable;
  filters: {
    from: string;
    to: string;
    preset: RangePreset;
    hostelId: string | null;
    status: string | null;
  };
};
