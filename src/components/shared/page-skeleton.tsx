import { Skeleton } from "@/components/ui/skeleton";

/** Generic loading skeleton for list/detail pages (used by loading.tsx). */
export function PageSkeleton({ variant = "table" }: { variant?: "table" | "cards" | "detail" | "dashboard" }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      {variant === "dashboard" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </>
      ) : variant === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : variant === "detail" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-8 w-32" />
          </div>
          <div className="overflow-hidden rounded-xl border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="ms-auto h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
