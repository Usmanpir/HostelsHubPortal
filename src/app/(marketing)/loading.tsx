import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingLoading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 pt-24 pb-16" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-64 rounded-full" />
      <Skeleton className="h-12 w-full max-w-2xl" />
      <Skeleton className="h-12 w-full max-w-xl" />
      <Skeleton className="h-5 w-full max-w-lg" />
      <div className="mt-2 flex gap-3">
        <Skeleton className="h-11 w-40" />
        <Skeleton className="h-11 w-36" />
      </div>
      <Skeleton className="mt-10 h-96 w-full max-w-5xl rounded-2xl" />
    </div>
  );
}
