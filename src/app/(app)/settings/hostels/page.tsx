import Link from "next/link";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { SectionHeader } from "@/components/settings/section-header";
import { hostelStatusLabels, hostelStatusTones } from "@/config/labels";
import { formatMoney } from "@/lib/format";
import { listHostelSettings } from "@/services/organization/settings-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Hostel settings" };

export default async function HostelSettingsPage() {
  const ctx = await requireSettingsPage("hostels.manage");
  const hostels = await listHostelSettings(ctx);
  const { currency, locale } = ctx.organization;

  return (
    <>
      <SectionHeader
        title="Hostel settings"
        description="Rent defaults, late fees, house rules and contact details are configured per hostel."
      />
      {hostels.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No hostels yet"
          description="Add a hostel to configure its rent defaults and rules."
          action={
            <Button asChild>
              <Link href="/hostels/new">
                <Plus />
                Add hostel
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {hostels.map((h) => (
            <li key={h.id}>
              <Link
                href={`/hostels/${h.id}/edit`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Building2 className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{h.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{h.code}</span>
                    <EnumBadge value={h.status} labels={hostelStatusLabels} tones={hostelStatusTones} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      h.city,
                      h.defaultBedRent !== null ? `Rent ${formatMoney(h.defaultBedRent, currency, locale)}/bed` : "No default rent",
                      `Due on day ${h.rentDueDay}`,
                      h.lateFeeAmount ? `Late fee ${formatMoney(h.lateFeeAmount, currency, locale)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="hidden text-sm font-medium text-primary sm:inline">Edit settings</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
