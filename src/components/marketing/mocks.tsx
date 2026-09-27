import {
  BarChart3,
  BedDouble,
  Bell,
  Building2,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  FileText,
  Home,
  LayoutDashboard,
  LogIn,
  Megaphone,
  Search,
  Settings,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stylised product illustrations built from divs and icons. They depict the
 * shape of the interface only — no real customer data or metrics.
 */

const BED_TONES = {
  o: "bg-primary/75",
  a: "bg-success/60",
  r: "bg-warning/65",
  m: "bg-danger/55",
} as const;
type BedTone = keyof typeof BED_TONES;

const FLOORS: { name: string; beds: BedTone[] }[] = [
  { name: "Third floor", beds: ["o", "o", "a", "o", "o", "o", "r", "o", "a", "o", "o", "o"] },
  { name: "Second floor", beds: ["o", "a", "o", "o", "m", "o", "o", "o", "o", "a", "o", "r"] },
  { name: "First floor", beds: ["o", "o", "o", "a", "o", "o", "o", "a", "o", "o", "o", "o"] },
];

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10 ring-1 ring-black/2", className)}>
      {children}
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return <span className={cn("block h-2 rounded-full bg-muted", className)} />;
}

export function DashboardMock() {
  const rail = [LayoutDashboard, Building2, BedDouble, Users, CreditCard, Wrench, BarChart3, Settings];
  return (
    <Frame>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-danger/60" />
        <span className="size-2.5 rounded-full bg-warning/60" />
        <span className="size-2.5 rounded-full bg-success/60" />
        <span className="ms-4 flex h-6 flex-1 items-center gap-2 rounded-md border bg-background px-2 text-[11px] text-muted-foreground sm:max-w-xs">
          <Search className="size-3" /> Search residents, rooms, invoices…
        </span>
      </div>
      <div className="flex">
        <div className="hidden flex-col items-center gap-3 border-e bg-muted/20 px-2.5 py-4 sm:flex">
          {rail.map((Icon, i) => (
            <span
              key={i}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg text-muted-foreground",
                i === 0 && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="size-4" />
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Dashboard</p>
              <p className="text-[11px] text-muted-foreground">Overview across your properties</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-[11px] font-medium">
              <Building2 className="size-3 text-primary" /> All hostels <ChevronDown className="size-3 text-muted-foreground" />
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[
              { label: "Occupancy", icon: BedDouble, tone: "bg-accent text-accent-foreground", bar: "w-4/5 bg-primary" },
              { label: "Rent collected", icon: CreditCard, tone: "bg-success-soft text-success", bar: "w-3/5 bg-success" },
              { label: "Pending dues", icon: FileText, tone: "bg-warning-soft text-warning", bar: "w-1/3 bg-warning" },
              { label: "Open requests", icon: Wrench, tone: "bg-info-soft text-info", bar: "w-1/4 bg-info" },
            ].map(({ label, icon: Icon, tone, bar }) => (
              <div key={label} className="rounded-xl border bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <span className={cn("flex size-6 items-center justify-center rounded-md", tone)}>
                    <Icon className="size-3" />
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", bar)} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2.5 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-xl border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Bed map</span>
                <span className="flex gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-sm bg-primary/75" />Occupied</span>
                  <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-sm bg-success/60" />Free</span>
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {FLOORS.map((f) => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{f.name}</span>
                    <div className="grid flex-1 grid-cols-12 gap-1">
                      {f.beds.map((b, i) => (
                        <span key={i} className={cn("h-4 rounded-[4px]", BED_TONES[b])} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <span className="text-xs font-medium">Today</span>
              <ul className="mt-2.5 grid gap-2">
                {[
                  { icon: LogIn, tone: "bg-success-soft text-success", w: "w-3/4" },
                  { icon: Bell, tone: "bg-warning-soft text-warning", w: "w-2/3" },
                  { icon: Wrench, tone: "bg-info-soft text-info", w: "w-1/2" },
                  { icon: CalendarCheck, tone: "bg-violet-soft text-violet", w: "w-3/5" },
                ].map(({ icon: Icon, tone, w }, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", tone)}>
                      <Icon className="size-3" />
                    </span>
                    <span className="flex flex-1 flex-col gap-1">
                      <Bar className={cn("h-1.5", w)} />
                      <Bar className="h-1.5 w-1/3 bg-muted/70" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function HostelsMock() {
  const rows = [
    { name: "City Centre", w: "w-[88%]", tone: "bg-primary" },
    { name: "Campus Road", w: "w-[72%]", tone: "bg-primary" },
    { name: "Lakeside", w: "w-[54%]", tone: "bg-warning" },
    { name: "Station View", w: "w-[93%]", tone: "bg-success" },
  ];
  return (
    <Frame className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Hostels</p>
        <span className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]">
          <Building2 className="size-3 text-primary" /> Switch hostel <ChevronDown className="size-3" />
        </span>
      </div>
      <ul className="mt-4 grid gap-3">
        {rows.map((r) => (
          <li key={r.name} className="rounded-xl border bg-background p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Home className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.name}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", r.w, r.tone)} />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function ResidentMock() {
  return (
    <Frame className="p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          <UserRound className="size-5" />
        </span>
        <div className="flex-1">
          <Bar className="w-32" />
          <Bar className="mt-2 w-20 bg-muted/70" />
        </div>
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Active</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        {["Room & bed", "Check-in", "Monthly rent", "Deposit"].map((label) => (
          <div key={label} className="rounded-lg border bg-background p-2.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-2">
              <Bar className="w-2/3" />
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-lg border bg-background p-3">
        <p className="text-xs font-medium">Documents</p>
        <ul className="mt-2 grid gap-1.5 text-[11px] text-muted-foreground">
          {["ID card", "Guardian contact", "Agreement"].map((d) => (
            <li key={d} className="flex items-center gap-2">
              <FileText className="size-3 text-primary" /> {d}
              <span className="ms-auto size-1.5 rounded-full bg-success" />
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

export function StaffMock() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const grid: ("p" | "l" | "a" | "o")[][] = [
    ["p", "p", "p", "p", "p", "o", "o"],
    ["p", "l", "p", "p", "p", "p", "o"],
    ["p", "p", "a", "p", "p", "p", "p"],
    ["o", "p", "p", "p", "l", "p", "p"],
  ];
  const tone = { p: "bg-success/60", l: "bg-warning/65", a: "bg-danger/55", o: "bg-muted" };
  return (
    <Frame className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Attendance</p>
        <span className="text-[11px] text-muted-foreground">This week</span>
      </div>
      <div className="mt-4 grid grid-cols-[72px_repeat(7,1fr)] gap-1.5 text-[10px] text-muted-foreground">
        <span />
        {days.map((d) => (
          <span key={d} className="text-center">
            {d}
          </span>
        ))}
        {grid.map((row, i) => (
          <div key={i} className="contents">
            <span className="flex items-center">
              <Bar className="h-1.5 w-12" />
            </span>
            {row.map((c, j) => (
              <span key={j} className={cn("h-6 rounded-md", tone[c])} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-success/60" />Present</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-warning/65" />Leave</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-danger/55" />Absent</span>
      </div>
    </Frame>
  );
}

export function InvoiceMock() {
  return (
    <Frame className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">Invoice</p>
          <Bar className="mt-2 w-24 bg-muted/70" />
        </div>
        <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">Partially paid</span>
      </div>
      <ul className="mt-5 grid gap-2.5 text-xs">
        {["Monthly rent", "Electricity", "Mess charges", "Late fee"].map((item, i) => (
          <li key={item} className="flex items-center justify-between gap-3 border-b pb-2.5 last:border-b-0">
            <span className="text-muted-foreground">{item}</span>
            <Bar className={cn("h-1.5", ["w-16", "w-10", "w-12", "w-8"][i])} />
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-lg bg-muted/40 p-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Paid</span>
          <span>Balance</span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-3/5 bg-success" />
          <div className="h-full w-2/5 bg-warning/70" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <span className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-[11px] font-medium text-primary-foreground">
          <CreditCard className="size-3" /> Record payment
        </span>
        <span className="inline-flex h-7 items-center justify-center rounded-md border px-3 text-[11px]">Receipt</span>
      </div>
    </Frame>
  );
}

export function ReportsMock() {
  const bars = [45, 62, 58, 71, 66, 80, 76, 88, 84, 92, 86, 95];
  return (
    <Frame className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Revenue vs expenses</p>
        <span className="text-[11px] text-muted-foreground">Last 12 months</span>
      </div>
      <div className="mt-5 flex h-36 items-end gap-1.5" aria-hidden>
        {bars.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col justify-end gap-0.5">
            <span className="rounded-t-sm bg-primary/80" style={{ height: `${h}%` }} />
            <span className="rounded-b-sm bg-chart-3/60" style={{ height: `${Math.round(h * 0.35)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-[auto_1fr] items-center gap-4">
        <span
          className="size-16 rounded-full"
          style={{ background: "conic-gradient(var(--chart-1) 0 62%, var(--chart-2) 62% 81%, var(--chart-3) 81% 93%, var(--muted) 93% 100%)" }}
        />
        <ul className="grid gap-1.5 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-2"><span className="size-2 rounded-sm bg-chart-1" />Occupied</li>
          <li className="flex items-center gap-2"><span className="size-2 rounded-sm bg-chart-2" />Available</li>
          <li className="flex items-center gap-2"><span className="size-2 rounded-sm bg-chart-3" />Reserved</li>
        </ul>
      </div>
    </Frame>
  );
}

export function PortalMock() {
  return (
    <div className="mx-auto w-64 rounded-[2rem] border-8 border-foreground/85 bg-card p-1 shadow-2xl shadow-primary/15">
      <div className="overflow-hidden rounded-[1.4rem] bg-background">
        <div className="bg-linear-to-br from-primary to-violet px-4 pt-6 pb-8 text-primary-foreground">
          <p className="text-[11px] opacity-80">Resident portal</p>
          <p className="mt-1 text-sm font-semibold">Good evening</p>
          <div className="mt-4 rounded-xl bg-white/15 p-3 backdrop-blur">
            <p className="text-[10px] opacity-80">Next rent due</p>
            <span className="mt-2 block h-2 w-20 rounded-full bg-white/60" />
          </div>
        </div>
        <div className="-mt-4 grid grid-cols-2 gap-2 px-3">
          {[
            { icon: FileText, label: "Invoices" },
            { icon: CreditCard, label: "Payments" },
            { icon: Wrench, label: "Maintenance" },
            { icon: Megaphone, label: "Notices" },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex flex-col items-start gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
              <Icon className="size-4 text-primary" />
              <span className="text-[10px] font-medium">{label}</span>
            </span>
          ))}
        </div>
        <div className="grid gap-2 p-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
              <span className="size-6 rounded-md bg-accent" />
              <span className="flex flex-1 flex-col gap-1">
                <Bar className="h-1.5 w-3/4" />
                <Bar className="h-1.5 w-1/2 bg-muted/70" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
