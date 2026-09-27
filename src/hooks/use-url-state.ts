"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Read/write list state (search, filters, page, sort) in the URL so views
 * are shareable, bookmarkable and rendered server-side.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams]);

  const set = useCallback(
    (updates: Record<string, string | number | null | undefined>, options: { resetPage?: boolean } = { resetPage: true }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") params.delete(key);
        else params.set(key, String(value));
      }
      if (options.resetPage && !("page" in updates)) params.delete("page");
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  return { get, set, pending, searchParams };
}
