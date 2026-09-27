import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/operations/filter-bar";
import { AnnouncementList, NewAnnouncementButton } from "@/components/operations/announcement-list";
import { SimplePager, UrlTabs } from "@/components/operations/url-tabs";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { getAnnouncementCounts, listAnnouncements } from "@/services/operations/announcement-service";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { announcementAudienceLabels, announcementCategoryLabels, optionsFrom } from "@/config/labels";
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_CATEGORIES } from "@/lib/validation/operations";

export const metadata = { title: "Announcements" };

const STATES = ["active", "scheduled", "expired", "archived"] as const;

export default async function AnnouncementsPage({ searchParams }: PageProps<"/operations/announcements">) {
  const ctx = await requireTenantPage("announcements.view");
  const params = await searchParams;
  const canPublish = can(ctx, "announcements.manage");
  const state = spEnum(params, "state", STATES) ?? "active";
  const q = sp(params, "q");
  const category = spEnum(params, "category", ANNOUNCEMENT_CATEGORIES);
  const audience = spEnum(params, "audience", ANNOUNCEMENT_AUDIENCES);

  const [data, counts, hostels] = await Promise.all([
    listAnnouncements(ctx, {
      state: canPublish ? state : "active",
      q,
      category,
      audience,
      page: spNumber(params, "page", 1),
      pageSize: 20,
    }),
    getAnnouncementCounts(ctx),
    canPublish ? listHostelOptions(ctx) : Promise.resolve([]),
  ]);
  const activeHostels = hostels.filter((h) => h.status !== "ARCHIVED").map((h) => ({ id: h.id, name: h.name }));
  const defaultHostelId = ctx.activeHostelId && activeHostels.some((h) => h.id === ctx.activeHostelId) ? ctx.activeHostelId : null;

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Notices for residents and staff — pinned and active first."
        breadcrumbs={[{ label: "Operations" }, { label: "Announcements" }]}
        actions={canPublish ? <NewAnnouncementButton hostels={activeHostels} allowOrgWide={ctx.allHostels} defaultHostelId={defaultHostelId} /> : null}
      />
      {canPublish ? (
        <UrlTabs
          param="state"
          tabs={[
            { value: "active", label: `Active${counts.active ? ` (${counts.active})` : ""}` },
            { value: "scheduled", label: `Scheduled${counts.scheduled ? ` (${counts.scheduled})` : ""}` },
            { value: "expired", label: "Expired" },
            { value: "archived", label: "Archived" },
          ]}
        />
      ) : null}
      <FilterBar
        searchPlaceholder="Search announcements"
        filters={[
          { key: "category", label: "Category", options: optionsFrom(announcementCategoryLabels) },
          ...(canPublish ? [{ key: "audience", label: "Audience", options: optionsFrom(announcementAudienceLabels) }] : []),
        ]}
      />
      <AnnouncementList
        items={data.items}
        canPublish={canPublish}
        hostels={activeHostels}
        allowOrgWide={ctx.allHostels}
        defaultHostelId={defaultHostelId}
        filtered={!!(q || category || audience)}
      />
      <SimplePager page={data.page} pageCount={data.pageCount} total={data.total} />
    </>
  );
}
