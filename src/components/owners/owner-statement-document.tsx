import { paymentTypeLabels } from "@/config/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { Terms } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { periodLabel } from "@/services/owners/period";
import type { OwnerStatement } from "@/services/owners/statement";

/** Printable, branded owner statement. Server component — rendered inside `.finance-print-area`. */
export function OwnerStatementDocument({ statement, terms, className }: { statement: OwnerStatement; terms: Terms; className?: string }) {
  const org = statement.organization;
  const money = (n: number) => formatMoney(n, org.currency, org.locale);
  const date = (d: string) => formatDate(d, org.locale);
  const { owner, totals, lines } = statement;
  const bank = [owner.bankName, owner.bankAccountTitle, owner.bankAccountNumber].filter(Boolean);

  return (
    <article className={cn("finance-print-area rounded-xl border bg-card p-5 sm:p-8", className)}>
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file route
            <img src={org.logoUrl} alt="" className="size-12 rounded-lg object-contain" />
          ) : (
            <span
              className="flex size-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground"
              style={org.primaryColor ? { backgroundColor: org.primaryColor } : undefined}
            >
              {org.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="text-sm">
            <p className="text-base font-semibold">{org.name}</p>
            {org.address ? <p className="print-muted text-muted-foreground">{org.address}</p> : null}
            <p className="print-muted text-muted-foreground">{[org.phone, org.email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="sm:text-end">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Owner statement</p>
          <p className="text-lg font-semibold">{periodLabel(statement.period, org.locale)}</p>
          <p className="print-muted text-xs text-muted-foreground">
            {date(statement.period.from)} – {date(statement.period.to)}
          </p>
        </div>
      </header>

      <section className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Prepared for</p>
          <p className="font-medium">{owner.name}</p>
          <p className="print-muted font-mono text-xs text-muted-foreground">{owner.ownerCode}</p>
          {owner.address ? <p className="print-muted text-muted-foreground">{owner.address}</p> : null}
          {owner.phone || owner.email ? (
            <p className="print-muted text-muted-foreground">{[owner.phone, owner.email].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
        <div className="sm:text-end">
          <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Payout account</p>
          {bank.length ? (
            bank.map((b, i) => (
              <p key={i} className={i === 0 ? "font-medium" : "print-muted text-muted-foreground"}>
                {b}
              </p>
            ))
          ) : (
            <p className="print-muted text-muted-foreground">No bank details on file</p>
          )}
        </div>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Summary">
        <Summary label="Rent collected" value={money(totals.collected)} />
        <Summary label="Expenses" value={`− ${money(totals.expenses)}`} />
        <Summary label="Management fee" value={`− ${money(totals.fee)}`} />
        <Summary label="Net payable" value={money(totals.net)} strong negative={totals.net < 0} />
      </section>

      <Section title={`By ${terms.property.toLowerCase()}`}>
        {lines.length === 0 ? (
          <Empty>No {terms.properties.toLowerCase()} are linked to this owner.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{terms.property}</Th>
                <Th end>Collected</Th>
                <Th end>Expenses</Th>
                <Th end>Fee</Th>
                <Th end>Net</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.hostelId} className="border-b last:border-b-0">
                  <Td>
                    <span className="font-medium">{l.name}</span>
                    <span className="print-muted block text-xs text-muted-foreground">
                      <span className="font-mono">{l.code}</span>
                      {l.archived ? " · archived" : ""}
                      {l.refunds > 0 ? ` · refunds ${money(l.refunds)}` : ""}
                    </span>
                  </Td>
                  <Td end>{money(l.collected)}</Td>
                  <Td end>{money(l.expenses)}</Td>
                  <Td end>
                    {money(l.fee)}
                    <span className="print-muted block text-xs text-muted-foreground">
                      {l.feePercent}%{l.feeSource === "PROPERTY" ? ` ${terms.property.toLowerCase()} rate` : ""}
                    </span>
                  </Td>
                  <Td end className={cn("font-medium", l.net < 0 && "text-danger")}>
                    {money(l.net)}
                  </Td>
                </tr>
              ))}
            </tbody>
            {lines.length > 1 ? (
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <Td>Total</Td>
                  <Td end>{money(totals.collected)}</Td>
                  <Td end>{money(totals.expenses)}</Td>
                  <Td end>{money(totals.fee)}</Td>
                  <Td end className={cn(totals.net < 0 && "text-danger")}>
                    {money(totals.net)}
                  </Td>
                </tr>
              </tfoot>
            ) : null}
          </Table>
        )}
      </Section>

      <Section title={`Rent collected (${statement.payments.length}${statement.paymentsTruncated ? "+" : ""})`}>
        {statement.payments.length === 0 ? (
          <Empty>No payments in this period.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Receipt</Th>
                <Th>{terms.resident}</Th>
                <Th className="hidden sm:table-cell print:table-cell">{terms.property}</Th>
                <Th>Type</Th>
                <Th end>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {statement.payments.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0">
                  <Td className="whitespace-nowrap">{date(p.date)}</Td>
                  <Td className="font-mono text-xs">{p.receiptNumber}</Td>
                  <Td>{p.resident}</Td>
                  <Td className="hidden sm:table-cell print:table-cell">{p.property}</Td>
                  <Td>{paymentTypeLabels[p.type]}</Td>
                  <Td end className={cn(p.amount < 0 && "text-danger")}>
                    {money(p.amount)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {statement.paymentsTruncated ? <Truncated /> : null}
      </Section>

      <Section title={`Expenses (${statement.expenses.length}${statement.expensesTruncated ? "+" : ""})`}>
        {statement.expenses.length === 0 ? (
          <Empty>No expenses recorded against these {terms.properties.toLowerCase()} in this period.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Vendor / description</Th>
                <Th className="hidden sm:table-cell print:table-cell">{terms.property}</Th>
                <Th end>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {statement.expenses.map((e) => (
                <tr key={e.id} className="border-b last:border-b-0">
                  <Td className="whitespace-nowrap">{date(e.date)}</Td>
                  <Td>{e.category}</Td>
                  <Td>
                    {e.vendor ?? "—"}
                    {e.description ? <span className="print-muted block text-xs text-muted-foreground">{e.description}</span> : null}
                  </Td>
                  <Td className="hidden sm:table-cell print:table-cell">{e.property}</Td>
                  <Td end>{money(e.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {statement.expensesTruncated ? <Truncated /> : null}
      </Section>

      <footer className="print-muted mt-8 border-t pt-4 text-xs text-muted-foreground">
        <p>
          Rent collected = payments + advances − refunds received in the period. The management fee is charged on rent collected at each{" "}
          {terms.property.toLowerCase()}&apos;s rate, or the owner&apos;s default of {owner.commissionPercent}%. Voided payments and expenses are excluded.
        </p>
        <p className="mt-1">Generated {formatDateTime(statement.generatedAt, undefined, org.locale)} · {org.legalName}</p>
      </footer>
    </article>
  );
}

function Summary({ label, value, strong, negative }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", strong && "border-primary/40 bg-accent/40")}>
      <p className="print-muted text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1 font-semibold", strong ? "text-lg" : "text-base", negative && "text-danger")}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border print:overflow-visible">
      <table className="w-full min-w-[32rem] text-sm print:min-w-0">{children}</table>
    </div>
  );
}

function Th({ children, end, className }: { children: React.ReactNode; end?: boolean; className?: string }) {
  return (
    <th className={cn("border-b bg-muted/40 px-3 py-2 text-start text-xs font-medium text-muted-foreground", end && "text-end", className)}>
      {children}
    </th>
  );
}

function Td({ children, end, className }: { children: React.ReactNode; end?: boolean; className?: string }) {
  return <td className={cn("px-3 py-2 align-top", end && "tabular text-end", className)}>{children}</td>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

function Truncated() {
  return <p className="print-muted mt-2 text-xs text-muted-foreground">Only the first 500 rows are listed; totals include every row.</p>;
}
