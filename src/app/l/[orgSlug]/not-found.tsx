import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A listing that is missing or no longer public (the org header/footer still render). */
export default function ListingNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <SearchX className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">This property is no longer listed</h1>
      <p className="text-sm text-muted-foreground">It may have been sold or rented. Take a look at what&apos;s available now.</p>
      <Button asChild variant="outline">
        {/* Relative link: resolves to this organization's listings page. */}
        <a href=".">Browse available properties</a>
      </Button>
    </div>
  );
}
