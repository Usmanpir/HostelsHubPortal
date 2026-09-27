import { Megaphone, Pin } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { ListPagination } from "@/components/portal/list-pagination";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { spNumber } from "@/lib/page-helpers";
import { listPortalAnnouncements } from "@/services/portal/announcement-service";
import { announcementCategoryLabels, announcementCategoryTones } from "@/config/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notices" };

export default async function PortalAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireResidentPage();
  const params = await searchParams;
  const data = await listPortalAnnouncements(ctx, { page: spNumber(params, "page", 1) });
  const fmt = portalFormatters(ctx);

  return (
    <>
      <PageHeader title="Notices" description="Announcements from your hostel." />
      {data.items.length === 0 ? (
        <EmptyState icon={Megaphone} title="No notices" description="Announcements from the hostel office will appear here." />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((a) => (
            <li
              key={a.id}
              className={cn(
                "rounded-2xl border bg-card p-4 sm:p-5",
                a.isPinned && "border-primary/30 bg-primary/[0.03]",
                a.category === "EMERGENCY" && "border-danger/30 bg-danger-soft/30",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.isPinned ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <Pin className="size-3.5" />
                    Pinned
                  </span>
                ) : null}
                <EnumBadge value={a.category} labels={announcementCategoryLabels} tones={announcementCategoryTones} />
                <span className="text-xs text-muted-foreground">
                  {fmt.dateTime(a.publishedAt)}
                  {a.hostel ? ` · ${a.hostel.name}` : ""}
                </span>
              </div>
              <h2 className="mt-2 text-base font-semibold">{a.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{a.body}</p>
              {a.expiresAt ? <p className="mt-3 text-xs text-muted-foreground">Valid until {fmt.dateTime(a.expiresAt)}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <ListPagination basePath="/portal/announcements" page={data.page} pageCount={data.pageCount} total={data.total} />
    </>
  );
}
