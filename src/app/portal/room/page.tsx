import { BedDouble, History, Mail, MapPin, Phone, ScrollText, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { DetailRow, PortalSection, SectionEmpty } from "@/components/portal/section";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { getPortalRoom } from "@/services/portal/room-service";
import { assignmentStatusLabels, assignmentStatusTones, roomTypeLabels } from "@/config/labels";

export const metadata = { title: "My room" };

export default async function PortalRoomPage() {
  const ctx = await requireResidentPage();
  const { assignment, roommates, hostel, history } = await getPortalRoom(ctx);
  const fmt = portalFormatters(ctx);
  const amenities = [...new Set([...(assignment?.room.amenities ?? []), ...(hostel?.amenities ?? [])])];

  return (
    <>
      <PageHeader title="My room" description="Your current bed, house rules and stay history." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {assignment ? (
            <section className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <BedDouble className="size-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold">
                      Room {assignment.room.roomNumber} · Bed {assignment.bed.bedNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {assignment.hostel.name} · {assignment.room.floor.name}
                    </p>
                  </div>
                </div>
                <EnumBadge value={assignment.status} labels={assignmentStatusLabels} tones={assignmentStatusTones} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Room type" value={roomTypeLabels[assignment.room.roomType]} />
                <Stat label="Capacity" value={`${assignment.room.capacity} bed${assignment.room.capacity === 1 ? "" : "s"}`} />
                <Stat label="Monthly rent" value={fmt.money(assignment.monthlyRent)} />
                <Stat label="Security deposit" value={fmt.money(assignment.securityDeposit)} />
                <Stat label={assignment.status === "RESERVED" ? "Check-in on" : "Checked in"} value={fmt.date(assignment.checkInDate)} />
                {assignment.checkOutDate ? <Stat label="Planned check-out" value={fmt.date(assignment.checkOutDate)} /> : null}
              </dl>
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
                <Users className="size-4 text-muted-foreground" />
                {roommates === 0
                  ? "You currently have the room to yourself."
                  : `You share this room with ${roommates} other resident${roommates === 1 ? "" : "s"}.`}
              </div>
            </section>
          ) : (
            <EmptyState
              icon={BedDouble}
              title="No bed assigned"
              description="You don't have an active room assignment. The hostel office will assign you a bed."
            />
          )}

          <PortalSection title="House rules" action={<ScrollText className="size-4 text-muted-foreground" />}>
            {hostel?.rules ? (
              <p className="px-4 py-4 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{hostel.rules}</p>
            ) : (
              <SectionEmpty>The hostel hasn&apos;t published any rules yet.</SectionEmpty>
            )}
          </PortalSection>

          <PortalSection title="Stay history" action={<History className="size-4 text-muted-foreground" />}>
            {history.length === 0 ? (
              <SectionEmpty>No stays recorded yet.</SectionEmpty>
            ) : (
              <ol className="divide-y">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {h.hostel.name} · Room {h.room.roomNumber}, bed {h.bed.bedNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt.date(h.checkInDate)} – {h.checkOutDate ? fmt.date(h.checkOutDate) : "present"} · {fmt.money(h.monthlyRent)}/month
                        {h.endReason ? ` · ${h.endReason}` : ""}
                      </p>
                    </div>
                    <EnumBadge value={h.status} labels={assignmentStatusLabels} tones={assignmentStatusTones} />
                  </li>
                ))}
              </ol>
            )}
          </PortalSection>
        </div>

        <div className="flex flex-col gap-4">
          {hostel ? (
            <PortalSection title={hostel.name}>
              <dl className="divide-y px-4">
                {hostel.address || hostel.city ? (
                  <DetailRow label="Address">
                    <span className="inline-flex items-start gap-1">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      {[hostel.address, hostel.city, hostel.country].filter(Boolean).join(", ")}
                    </span>
                  </DetailRow>
                ) : null}
                {hostel.phone ? (
                  <DetailRow label="Phone">
                    <a href={`tel:${hostel.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                      <Phone className="size-3.5" />
                      {hostel.phone}
                    </a>
                  </DetailRow>
                ) : null}
                {hostel.email ? (
                  <DetailRow label="Email">
                    <a href={`mailto:${hostel.email}`} className="inline-flex items-center gap-1 break-all hover:text-primary">
                      <Mail className="size-3.5 shrink-0" />
                      {hostel.email}
                    </a>
                  </DetailRow>
                ) : null}
                <DetailRow label="Rent due">Day {hostel.rentDueDay} of each month</DetailRow>
                {hostel.lateFeeAmount ? (
                  <DetailRow label="Late fee">
                    {fmt.money(hostel.lateFeeAmount)} after {hostel.lateFeeGraceDays} day{hostel.lateFeeGraceDays === 1 ? "" : "s"}
                  </DetailRow>
                ) : null}
              </dl>
            </PortalSection>
          ) : null}

          <PortalSection title="Amenities" action={<Sparkles className="size-4 text-muted-foreground" />}>
            {amenities.length === 0 ? (
              <SectionEmpty>No amenities listed.</SectionEmpty>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-4">
                {amenities.map((a) => (
                  <Badge key={a} variant="secondary">
                    {a}
                  </Badge>
                ))}
              </div>
            )}
          </PortalSection>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular">{value}</dd>
    </div>
  );
}
