import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Server-rendered previous/next pager that keeps other query params. */
export function ListPagination({
  basePath,
  page,
  pageCount,
  total,
  params = {},
}: {
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  params?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground" aria-label="Pagination">
      <span className="tabular">
        Page {page} of {pageCount} · {total} total
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)} scroll={false}>
              <ChevronLeft className="rtl:rotate-180" />
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="rtl:rotate-180" />
            Previous
          </Button>
        )}
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)} scroll={false}>
              Next
              <ChevronRight className="rtl:rotate-180" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        )}
      </div>
    </nav>
  );
}
