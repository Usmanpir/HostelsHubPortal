"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function MarketingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <ErrorState description="We couldn't load this page. Please try again in a moment." onRetry={reset} />
    </div>
  );
}
