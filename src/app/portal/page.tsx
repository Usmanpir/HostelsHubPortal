import Link from "next/link";
import {
  BedDouble,
  CalendarClock,
  CheckCircle2,
  FileText,
  Megaphone,
  MessageSquareWarning,
  Pin,
  Send,
  Wallet,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnumBadge } from "@/components/shared/status-badge";
import { PortalSection, SectionEmpty } from "@/components/portal/section";
import { MaintenanceDialog } from "@/components/portal/maintenance-dialog";
import { ComplaintDialog } from "@/components/portal/complaint-dialog";
import { RequestDialog } from "@/components/portal/request-dialog";
import { greeting, portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { getPortalDashboard } from "@/services/portal/dashboard-service";
import { listAvailableGateways } from "@/services/payments/online-payment-service";
import { PayOnlineButton } from "@/components/payments/pay-online-button";
import {
  announcementCategoryLabels,
  announcementCategoryTones,
  assignmentStatusLabels,
  assignmentStatusTones,
  complaintStatusLabels,
  complaintStatusTones,
  invoiceStatusLabels,
  invoiceStatusTones,
  maintenanceStatusLabels,
  maintenanceStatusTones,
  paymentMethodLabels,
  paymentTypeLabels,
  residentStatusLabels,
  residentStatusTones,
  roomTypeLabels,
} from "@/config/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Home" };

export default async function PortalHomePage() {
  const ctx = await requireResidentPage();
  const [data, gateways] = await Promise.all([getPortalDashboard(ctx), listAvailableGateways(ctx.organizationId)]);
  const fmt = portalFormatters(ctx);
  const { assignment, balance, nextDue } = data;
  const firstName = data.resident.firstName;
  const location = assignment ? `Room ${assignment.room.roomNumber}, bed ${assignment.bed.bedNumber}` : null;
  const owes = balance.balance > 0;

  return (
    <div className="flex flex-col gap-5">
      {data.resident.status === "CHECKED_OUT" ? (
        <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <Megaphone className="size-4 shrink-0" />
          Your stay has ended. You can still view your invoices and receipts here.
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{greeting(ctx.organization.timezone)},</p>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {firstName}
          {data.resident.status !== "ACTIVE" ? (
            <EnumBadge value={data.resident.status} labels={residentStatusLabels} tones={residentStatusTones} />
          ) : null}
        </h1>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Stay */}
        <section className="relative overflow-hidden rounded-2xl border bg-linear-to-br from-primary/10 via-card to-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your stay</p>
              <p className="mt-1 truncate text-lg font-semibold">{assignment?.hostel.name ?? "No bed assigned yet"}</p>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BedDouble className="size-5" />
            </span>
          </div>
          {assignment ? (
            <>
              <dl className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Room</dt>
                  <dd className="text-base font-semibold tabular">{assignment.room.roomNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Bed</dt>
                  <dd className="text-base font-semibold tabular">{assignment.bed.bedNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rent / month</dt>
                  <dd className="text-base font-semibold tabular">{fmt.money(assignment.monthlyRent)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                <EnumBadge value={assignment.status} labels={assignmentStatusLabels} tones={assignmentStatusTones} />
                <span>{roomTypeLabels[assignment.room.roomType]} room</span>
                <span>{assignment.room.floor.name}</span>
                <span>Since {fmt.date(assignment.checkInDate)}</span>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Once the office assigns you a bed, your room details will appear here.
            </p>
          )}
          <Link href="/portal/room" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Room details & house rules
          </Link>
        </section>

        {/* Balance */}
        <section
          className={cn(
            "rounded-2xl border p-5",
            owes ? "border-danger/20 bg-danger-soft/40" : "bg-card",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Outstanding</p>
              <p className={cn("mt-1 text-3xl font-semibold tracking-tight tabular", owes && "text-danger")}>
                {fmt.money(Math.max(balance.balance, 0))}
              </p>
            </div>
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                owes ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
              )}
            >
              {owes ? <Wallet className="size-5" /> : <CheckCircle2 className="size-5" />}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-1 text-sm">
            {balance.overdue > 0 ? (
              <p className="font-medium text-danger">{fmt.money(balance.overdue)} is overdue</p>
            ) : null}
            {balance.credit > 0 ? (
              <p className="text-muted-foreground">Includes {fmt.money(balance.credit)} advance credit on your account</p>
            ) : null}
            {balance.balance < 0 ? (
              <p className="text-success">You have {fmt.money(-balance.balance)} in credit.</p>
            ) : null}
          </div>
          {nextDue ? (
            <Link
              href={`/portal/invoices/${nextDue.id}`}
              className="mt-4 flex items-center gap-3 rounded-xl border bg-background/70 p-3 transition-colors hover:border-primary/30"
            >
              <CalendarClock className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Next payment due {fmt.date(nextDue.dueDate)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {nextDue.invoiceNumber} · {fmt.money(nextDue.balance)} remaining
                </p>
              </div>
              <EnumBadge value={nextDue.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
            </Link>
          ) : null}
          {nextDue && nextDue.balance > 0 && gateways.length > 0 ? (
            <PayOnlineButton
              invoiceId={nextDue.id}
              amountLabel={fmt.money(nextDue.balance)}
              gateways={gateways}
              label="Pay now"
              className="mt-3 w-full"
            />
          ) : null}
          {nextDue ? null : (
            <p className="mt-4 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              You&apos;re all paid up. Nothing is due right now.
            </p>
          )}
        </section>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MaintenanceDialog
          location={location}
          trigger={
            <QuickAction icon={Wrench} label="Report an issue" />
          }
        />
        <ComplaintDialog trigger={<QuickAction icon={MessageSquareWarning} label="File a complaint" />} />
        <RequestDialog defaultType="LEAVE" trigger={<QuickAction icon={Send} label="Request leave" />} />
        <Button asChild variant="outline" className="h-auto flex-col gap-2 rounded-xl py-4">
          <Link href="/portal/invoices">
            <FileText className="size-5 text-primary" />
            <span className="text-xs font-medium">My invoices</span>
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PortalSection title="Announcements" href="/portal/announcements">
          {data.announcements.length === 0 ? (
            <SectionEmpty>No announcements right now.</SectionEmpty>
          ) : (
            <ul className="divide-y">
              {data.announcements.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {a.isPinned ? <Pin className="size-3.5 text-primary" aria-label="Pinned" /> : null}
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</p>
                    <EnumBadge value={a.category} labels={announcementCategoryLabels} tones={announcementCategoryTones} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmt.date(a.publishedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>

        <PortalSection title="Recent payments" href="/portal/payments">
          {data.payments.length === 0 ? (
            <SectionEmpty>No payments recorded yet.</SectionEmpty>
          ) : (
            <ul className="divide-y">
              {data.payments.map((p) => (
                <li key={p.id}>
                  <Link href={`/portal/payments/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                      <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.receiptNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt.date(p.paymentDate)} · {paymentMethodLabels[p.method]}
                        {p.type !== "PAYMENT" ? ` · ${paymentTypeLabels[p.type]}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular">{fmt.money(p.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>

        <PortalSection
          title="Open maintenance"
          description={data.maintenance.total ? `${data.maintenance.total} open` : undefined}
          href="/portal/maintenance"
        >
          {data.maintenance.items.length === 0 ? (
            <SectionEmpty>No open maintenance requests.</SectionEmpty>
          ) : (
            <ul className="divide-y">
              {data.maintenance.items.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{m.requestNumber}</span> · {fmt.date(m.createdAt)}
                    </p>
                  </div>
                  <EnumBadge value={m.status} labels={maintenanceStatusLabels} tones={maintenanceStatusTones} />
                </li>
              ))}
            </ul>
          )}
        </PortalSection>

        <PortalSection
          title="Open complaints"
          description={data.complaints.total ? `${data.complaints.total} open` : undefined}
          href="/portal/complaints"
        >
          {data.complaints.items.length === 0 ? (
            <SectionEmpty>No open complaints.</SectionEmpty>
          ) : (
            <ul className="divide-y">
              {data.complaints.items.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{c.complaintNumber}</span> · {fmt.date(c.createdAt)}
                    </p>
                  </div>
                  <EnumBadge value={c.status} labels={complaintStatusLabels} tones={complaintStatusTones} />
                </li>
              ))}
            </ul>
          )}
        </PortalSection>
      </div>

    </div>
  );
}

function QuickAction({ icon: Icon, label, ...props }: { icon: typeof Wrench; label: string } & React.ComponentProps<"button">) {
  return (
    <Button variant="outline" className="h-auto flex-col gap-2 rounded-xl py-4" {...props}>
      <Icon className="size-5 text-primary" />
      <span className="text-xs font-medium">{label}</span>
    </Button>
  );
}
