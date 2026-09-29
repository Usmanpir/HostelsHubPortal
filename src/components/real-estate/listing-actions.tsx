"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, FileEdit, Handshake, Home, KeyRound, RotateCcw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { listingStatusLabels } from "@/config/real-estate-labels";
import type { ListingStatus } from "@/generated/prisma/enums";
import { changeListingStatusAction, setListingPublishedAction } from "@/app/(app)/listings/actions";

function meta(from: ListingStatus, to: ListingStatus): { label: string; icon: LucideIcon; variant: "default" | "outline" | "destructive"; description: string } {
  switch (to) {
    case "ACTIVE":
      return from === "DRAFT"
        ? { label: "Activate", icon: CheckCircle2, variant: "default", description: "The listing becomes available to clients and can be published." }
        : from === "RENTED"
          ? { label: "Re-list", icon: RotateCcw, variant: "outline", description: "Make this rental available again." }
          : { label: "Back to active", icon: RotateCcw, variant: "outline", description: "The offer fell through; the listing is available again." };
    case "UNDER_OFFER":
      return { label: "Under offer", icon: Handshake, variant: "outline", description: "A client has made an offer. The listing stays visible." };
    case "SOLD":
      return { label: "Mark sold", icon: Home, variant: "outline", description: "The property is sold. It will be unpublished." };
    case "RENTED":
      return { label: "Mark rented", icon: KeyRound, variant: "outline", description: "The property is rented out. It will be unpublished." };
    case "DRAFT":
      return from === "ARCHIVED"
        ? { label: "Restore", icon: RotateCcw, variant: "outline", description: "The listing returns as a draft." }
        : { label: "Back to draft", icon: FileEdit, variant: "outline", description: "The listing is hidden from clients and unpublished." };
    case "ARCHIVED":
      return { label: "Archive", icon: Archive, variant: "destructive", description: "Archived listings are hidden from lists and the public page. History is kept." };
  }
}

export function ListingStatusButtons({ listingId, status, allowed }: { listingId: string; status: ListingStatus; allowed: ListingStatus[] }) {
  if (allowed.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((to) => {
        const m = meta(status, to);
        const Icon = m.icon;
        return (
          <ConfirmAction
            key={to}
            trigger={
              <Button variant={m.variant === "destructive" ? "ghost" : m.variant} size="sm" className={m.variant === "destructive" ? "text-destructive" : undefined}>
                <Icon />
                {m.label}
              </Button>
            }
            title={`${m.label}?`}
            description={`${listingStatusLabels[status]} → ${listingStatusLabels[to]}. ${m.description}`}
            confirmLabel={m.label}
            destructive={m.variant === "destructive"}
            action={() => changeListingStatusAction(listingId, { status: to })}
          />
        );
      })}
    </div>
  );
}

export function ListingPublishSwitch({
  listingId,
  published,
  canPublish,
  publicSiteEnabled,
}: {
  listingId: string;
  published: boolean;
  canPublish: boolean;
  publicSiteEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = (value: boolean) =>
    start(async () => {
      try {
        const result = await setListingPublishedAction(listingId, { published: value });
        if (result.ok) {
          toast.success(result.message ?? "Saved");
          router.refresh();
        } else toast.error(result.error);
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <label htmlFor="listing-publish" className="text-sm font-medium">
          Show on public page
        </label>
        <p className="text-xs text-muted-foreground">
          {!canPublish && !published
            ? "Only active or under-offer listings can be published."
            : publicSiteEnabled
              ? "Published listings appear on your public listings page."
              : "Your public listings page is off; published listings appear once it is enabled in Settings."}
        </p>
      </div>
      <Switch id="listing-publish" checked={published} disabled={pending || (!canPublish && !published)} onCheckedChange={toggle} />
    </div>
  );
}
