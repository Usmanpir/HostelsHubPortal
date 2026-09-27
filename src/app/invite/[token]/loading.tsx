import { Skeleton } from "@/components/ui/skeleton";

export default function InviteLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading invitation">
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
