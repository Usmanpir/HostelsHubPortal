import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10" aria-busy="true" aria-label="Loading setup">
      <div className="hidden flex-col gap-3 lg:flex">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mb-3 h-6 w-48" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-2 w-full lg:hidden" />
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-2 border-b px-7 py-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 px-7 py-6 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
