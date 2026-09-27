import Link from "next/link";
import {
  BedDouble,
  ClipboardList,
  CreditCard,
  FileText,
  Mail,
  MessageSquareWarning,
  Phone,
  Receipt,
  ShieldAlert,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ResidentAvatar } from "@/components/residents/resident-avatar";
import { ResidentActions } from "@/components/residents/resident-actions";
import { StayTimeline } from "@/components/residents/stay-timeline";
import { DocumentsCard } from "@/components/residents/documents-card";
import { PortalAccessCard } from "@/components/residents/portal-access-card";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404, sp } from "@/lib/page-helpers";
import { formatDate, formatMoney, todayInTimeZone, toDateInput } from "@/lib/format";
import {
  approvalStatusLabels,
  approvalStatusTones,
  assignmentStatusLabels,
  assignmentStatusTones,
  genderLabels,
  invoiceStatusLabels,
  invoiceStatusTones,
  paymentMethodLabels,
  paymentStatusLabels,
  paymentStatusTones,
  paymentTypeLabels,
  residentRequestTypeLabels,
  residentStatusLabels,
  residentStatusTones,
} from "@/config/labels";
import { getResident } from "@/services/resident/resident-service";
import { listAssignableHostels } from "@/services/resident/assignment-service";

export default async function ResidentProfilePage({ params, searchParams }: PageProps<"/residents/[id]">) {
  const ctx = await requireTenantPage("residents.view");
  const { id } = await params;
  const query = await searchParams;
  const r = await loadOr404(getResident(ctx, id));
  const stay = r.currentStay;
  const canAssign = can(ctx, "assignments.manage");
  const hostels = canAssign && stay?.status === "ACTIVE" ? await listAssignableHostels(ctx) : [];
  const currency = ctx.organization.currency;
  const locale = ctx.organization.locale;
  const money = (n: number) => formatMoney(n, currency, locale);
  const date = (d: Date | null) => formatDate(d, locale);
  const today = todayInTimeZone(ctx.organization.timezone);
  const archived = r.status === "ARCHIVED";
  const finance = r.finance;

  return (
    <>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-3">
            <ResidentAvatar name={r.name} photoFileId={r.photoFileId} size="lg" />
            <span className="truncate">{r.name}</span>
            <EnumBadge value={r.status} labels={residentStatusLabels} tones={residentStatusTones} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{r.residentCode}</span>
            <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
              <Phone className="size-3.5" />
              {r.phone}
            </a>
            <span>{r.hostel.name}</span>
            {stay ? <span>{stay.label}</span> : null}
          </span>
        }
        breadcrumbs={[{ label: "Residents", href: "/residents" }, { label: r.name }]}
        actions={
          <ResidentActions
            today={today}
            hostels={hostels}
            openTransfer={sp(query, "transfer") === "1" && stay?.status === "ACTIVE"}
            resident={{
              id: r.id,
              name: r.name,
              status: r.status,
              hostelId: r.hostelId,
              stay: stay
                ? {
                    id: stay.id,
                    status: stay.status,
                    bedId: stay.bedId,
                    label: stay.label,
                    monthlyRent: stay.monthlyRent,
                    checkInDate: toDateInput(stay.checkInDate),
                  }
                : null,
            }}
          />
        }
      />

      {archived ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <ShieldAlert className="size-4" />
          This resident is archived. Their history, invoices and payments are preserved.
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={stay?.status === "RESERVED" ? "Reserved bed" : "Current bed"}
          value={stay ? <span className="text-lg">{stay.label}</span> : <span className="text-lg text-muted-foreground">No bed</span>}
          hint={stay ? `${stay.hostel.name} · since ${date(stay.checkInDate)}` : r.actualLeavingDate ? `Left ${date(r.actualLeavingDate)}` : "Not checked in"}
          icon={BedDouble}
          tone={stay?.status === "ACTIVE" ? "success" : "default"}
        />
        <StatCard label="Monthly rent" value={stay ? money(stay.monthlyRent) : "—"} hint={stay ? `Deposit ${money(stay.securityDeposit)}` : undefined} icon={Wallet} />
        {finance ? (
          <StatCard
            label={finance.balance.balance < 0 ? "Credit" : "Balance due"}
            value={money(Math.abs(finance.balance.balance))}
            hint={finance.balance.overdue > 0 ? `${money(finance.balance.overdue)} overdue` : finance.balance.balance > 0 ? "Nothing overdue" : "All settled"}
            icon={Receipt}
            tone={finance.balance.overdue > 0 ? "danger" : finance.balance.balance > 0 ? "warning" : "success"}
          />
        ) : (
          <StatCard label="Stays" value={r.assignments.length} icon={ClipboardList} />
        )}
        <StatCard
          label="Open issues"
          value={r.counts.openComplaints + r.counts.openMaintenance + r.counts.pendingRequests}
          hint={`${r.counts.pendingRequests} requests · ${r.counts.openComplaints} complaints · ${r.counts.openMaintenance} maintenance`}
          icon={MessageSquareWarning}
          tone={r.counts.openComplaints + r.counts.openMaintenance + r.counts.pendingRequests > 0 ? "warning" : "default"}
        />
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stays">Stays ({r.assignments.length})</TabsTrigger>
            {finance ? <TabsTrigger value="finance">Finance</TabsTrigger> : null}
            {r.documents ? <TabsTrigger value="documents">Documents ({r.documents.length})</TabsTrigger> : null}
            {r.requests ? <TabsTrigger value="requests">Requests{r.counts.pendingRequests ? ` (${r.counts.pendingRequests})` : ""}</TabsTrigger> : null}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <InfoCard
                title="Contact"
                items={[
                  { label: "Phone", value: <a href={`tel:${r.phone}`} className="hover:text-primary">{r.phone}</a> },
                  { label: "Alternate phone", value: r.alternatePhone },
                  { label: "Email", value: r.email ? <a href={`mailto:${r.email}`} className="break-all hover:text-primary">{r.email}</a> : null },
                  { label: "Address", value: [r.address, r.city].filter(Boolean).join(", ") || null, wide: true },
                ]}
              />
              <InfoCard
                title="Personal"
                items={[
                  { label: "Gender", value: r.gender ? genderLabels[r.gender] : null },
                  { label: "Date of birth", value: r.dateOfBirth ? date(r.dateOfBirth) : null },
                  { label: "CNIC / Passport", value: r.idNumber },
                  { label: "Nationality", value: r.nationality },
                  { label: "Joined", value: date(r.joiningDate) },
                  { label: "Expected leaving", value: r.expectedLeavingDate ? date(r.expectedLeavingDate) : null },
                  ...(r.actualLeavingDate ? [{ label: "Left on", value: date(r.actualLeavingDate) }] : []),
                ]}
              />
              <InfoCard
                title="Occupation"
                items={[
                  { label: "Occupation", value: r.occupation },
                  { label: "University / employer", value: r.institution },
                ]}
              />
              <InfoCard
                title="Emergency & guardian"
                items={[
                  {
                    label: "Emergency contact",
                    value: r.emergencyContactName
                      ? `${r.emergencyContactName}${r.emergencyContactRelation ? ` (${r.emergencyContactRelation})` : ""}`
                      : null,
                  },
                  {
                    label: "Emergency phone",
                    value: r.emergencyContactPhone ? <a href={`tel:${r.emergencyContactPhone}`} className="hover:text-primary">{r.emergencyContactPhone}</a> : null,
                  },
                  { label: "Guardian", value: r.guardianName },
                  { label: "Guardian phone", value: r.guardianPhone ? <a href={`tel:${r.guardianPhone}`} className="hover:text-primary">{r.guardianPhone}</a> : null },
                ]}
              />
              {r.notes ? (
                <section className="rounded-xl border bg-card p-4">
                  <h2 className="mb-2 text-sm font-semibold">Notes</h2>
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{r.notes}</p>
                </section>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
              <section className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Current stay</h2>
                  {stay ? <EnumBadge value={stay.status} labels={assignmentStatusLabels} tones={assignmentStatusTones} /> : null}
                </div>
                {stay ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Detail label="Hostel" value={stay.hostel.name} />
                    <Detail label="Floor" value={stay.room.floor.name} />
                    <Detail label="Room" value={can(ctx, "rooms.view") ? <Link href={`/hostels/rooms/${stay.room.id}`} className="hover:text-primary">{stay.room.roomNumber}</Link> : stay.room.roomNumber} />
                    <Detail label="Bed" value={stay.bed.bedNumber} />
                    <Detail label={stay.status === "RESERVED" ? "Move-in" : "Checked in"} value={date(stay.checkInDate)} />
                    <Detail label="Monthly rent" value={<span className="tabular">{money(stay.monthlyRent)}</span>} />
                    <Detail label="Security deposit" value={<span className="tabular">{money(stay.securityDeposit)}</span>} />
                    {stay.roomCapacity ? <Detail label="Room capacity" value={`${stay.roomCapacity} beds`} /> : null}
                  </dl>
                ) : (
                  <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
                    <p>{r.status === "CHECKED_OUT" ? "Checked out — see the stay history." : "No bed assigned yet."}</p>
                    {canAssign && !archived && r.status !== "SUSPENDED" ? (
                      <Button asChild size="sm">
                        <Link href={`/residents/check-in?residentId=${r.id}`}>{r.status === "CHECKED_OUT" ? "Re-admit" : "Check in"}</Link>
                      </Button>
                    ) : null}
                  </div>
                )}
              </section>

              <PortalAccessCard
                residentId={r.id}
                email={r.email}
                user={r.user ? { id: r.user.id, email: r.user.email, lastLoginAt: r.user.lastLoginAt } : null}
                canManage={can(ctx, "residents.manage")}
                archived={archived}
              />

              <section className="rounded-xl border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold">Activity</h2>
                <ul className="grid gap-2 text-sm">
                  <ActivityRow
                    icon={ClipboardList}
                    label="Pending requests"
                    value={r.counts.pendingRequests}
                    href={can(ctx, "requests.view") ? `/residents/requests?residentId=${r.id}` : undefined}
                  />
                  <ActivityRow
                    icon={MessageSquareWarning}
                    label="Open complaints"
                    value={r.counts.openComplaints}
                    total={r.counts.totalComplaints}
                    href={can(ctx, "complaints.view") ? `/operations/complaints?residentId=${r.id}` : undefined}
                  />
                  <ActivityRow
                    icon={Wrench}
                    label="Open maintenance"
                    value={r.counts.openMaintenance}
                    total={r.counts.totalMaintenance}
                    href={can(ctx, "maintenance.view") ? `/operations/maintenance?residentId=${r.id}` : undefined}
                  />
                  <ActivityRow
                    icon={Users}
                    label="Visitors logged"
                    value={r.counts.visitors}
                    href={can(ctx, "visitors.view") ? `/operations/visitors?residentId=${r.id}` : undefined}
                  />
                </ul>
              </section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stays">
          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Stay history</h2>
                <p className="text-xs text-muted-foreground">Every bed this resident has reserved or occupied, including transfers.</p>
              </div>
            </header>
            <StayTimeline stays={r.assignments} currency={currency} locale={locale} showRoomLinks={can(ctx, "rooms.view")} />
          </section>
        </TabsContent>

        {finance ? (
          <TabsContent value="finance">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Outstanding" value={money(finance.balance.outstanding)} tone={finance.balance.outstanding > 0 ? "warning" : "default"} />
                  <StatCard label="Overdue" value={money(finance.balance.overdue)} tone={finance.balance.overdue > 0 ? "danger" : "default"} />
                  <StatCard label="Advance credit" value={money(finance.balance.credit)} tone={finance.balance.credit > 0 ? "success" : "default"} />
                  <StatCard label="Deposit held" value={money(finance.depositHeld)} />
                </div>
              </div>
              {!archived && (can(ctx, "invoices.manage") || can(ctx, "payments.manage")) ? (
                <div className="flex flex-wrap gap-2">
                  {can(ctx, "invoices.manage") ? (
                    <Button asChild variant="outline">
                      <Link href={`/finance/invoices/new?residentId=${r.id}`}>
                        <FileText />
                        Create invoice
                      </Link>
                    </Button>
                  ) : null}
                  {can(ctx, "payments.manage") ? (
                    <Button asChild>
                      <Link href={`/finance/payments/new?residentId=${r.id}`}>
                        <CreditCard />
                        Record payment
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                {finance.invoices ? (
                  <section className="rounded-xl border bg-card">
                    <header className="flex items-center justify-between border-b px-4 py-3">
                      <h2 className="text-sm font-semibold">Recent invoices</h2>
                      <Link href={`/finance/invoices?residentId=${r.id}`} className="text-xs text-muted-foreground hover:text-primary">
                        View all
                      </Link>
                    </header>
                    {finance.invoices.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">No invoices yet.</p>
                    ) : (
                      <ul className="divide-y">
                        {finance.invoices.map((inv) => (
                          <li key={inv.id}>
                            <Link href={`/finance/invoices/${inv.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30">
                              <div className="min-w-0 flex-1">
                                <p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p>
                                <p className="text-xs text-muted-foreground">
                                  Issued {date(inv.issueDate)} · due {date(inv.dueDate)}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="tabular text-sm font-medium">{money(inv.total)}</span>
                                <EnumBadge value={inv.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}
                {finance.payments ? (
                  <section className="rounded-xl border bg-card">
                    <header className="flex items-center justify-between border-b px-4 py-3">
                      <h2 className="text-sm font-semibold">Recent payments</h2>
                      <Link href={`/finance/payments?residentId=${r.id}`} className="text-xs text-muted-foreground hover:text-primary">
                        View all
                      </Link>
                    </header>
                    {finance.payments.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
                    ) : (
                      <ul className="divide-y">
                        {finance.payments.map((p) => (
                          <li key={p.id}>
                            <Link href={`/finance/payments/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30">
                              <div className="min-w-0 flex-1">
                                <p className="font-mono text-sm font-medium">{p.receiptNumber}</p>
                                <p className="text-xs text-muted-foreground">
                                  {date(p.paymentDate)} · {paymentTypeLabels[p.type]} · {paymentMethodLabels[p.method]}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="tabular text-sm font-medium">{p.type === "REFUND" ? `−${money(p.amount)}` : money(p.amount)}</span>
                                {p.status !== "COMPLETED" ? (
                                  <EnumBadge value={p.status} labels={paymentStatusLabels} tones={paymentStatusTones} />
                                ) : null}
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}
              </div>
            </div>
          </TabsContent>
        ) : null}

        {r.documents ? (
          <TabsContent value="documents">
            <DocumentsCard residentId={r.id} documents={r.documents} canUpload={!archived} />
          </TabsContent>
        ) : null}

        {r.requests ? (
          <TabsContent value="requests">
            <section className="rounded-xl border bg-card">
              <header className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Requests</h2>
                <Link href={`/residents/requests?residentId=${r.id}&status=ALL`} className="text-xs text-muted-foreground hover:text-primary">
                  Manage requests
                </Link>
              </header>
              {r.requests.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No requests from this resident.</p>
              ) : (
                <ul className="divide-y">
                  {r.requests.map((q) => (
                    <li key={q.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{q.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {residentRequestTypeLabels[q.type]} · {date(q.createdAt)}
                          {q.startDate ? ` · ${date(q.startDate)}${q.endDate ? ` – ${date(q.endDate)}` : ""}` : ""}
                        </p>
                        {q.response ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{q.reviewedBy?.name ?? "Staff"}:</span> {q.response}
                          </p>
                        ) : null}
                      </div>
                      <EnumBadge value={q.status} labels={approvalStatusLabels} tones={approvalStatusTones} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}

function InfoCard({ title, items }: { title: string; items: { label: string; value: React.ReactNode; wide?: boolean }[] }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {items.map((i) => (
          <div key={i.label} className={i.wide ? "sm:col-span-2" : undefined}>
            <dt className="text-xs text-muted-foreground">{i.label}</dt>
            <dd className="mt-0.5">{i.value ?? <span className="text-muted-foreground">—</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function ActivityRow({
  icon: Icon,
  label,
  value,
  total,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: number;
  total?: number | null;
  href?: string;
}) {
  const body = (
    <>
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {total !== undefined && total !== null ? <span className="text-xs text-muted-foreground">{total} total</span> : null}
      <StatusBadge tone={value > 0 ? "warning" : "neutral"} dot={false}>
        {value}
      </StatusBadge>
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40">
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-2 py-1.5">{body}</div>
      )}
    </li>
  );
}
