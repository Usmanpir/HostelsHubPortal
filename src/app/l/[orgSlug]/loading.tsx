import { Skeleton } from "@/components/ui/skeleton";

export default function PublicListingsLoading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Loading properties">
      <Skeleton className="h-40 rounded-3xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
