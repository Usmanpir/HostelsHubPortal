import type { ListingPurpose, ListingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { PURPOSE_LABEL } from "./format";

export function ListingBadges({
  purpose,
  status,
  className,
}: {
  purpose: ListingPurpose;
  status: ListingStatus;
  className?: string;
}) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shadow-xs";
  return (
    <>
      <span className={cn(base, "bg-primary text-primary-foreground", className)}>{PURPOSE_LABEL[purpose]}</span>
      {status === "UNDER_OFFER" ? (
        <span className={cn(base, "bg-warning-soft text-warning ring-1 ring-warning/20", className)}>Under offer</span>
      ) : null}
    </>
  );
}
