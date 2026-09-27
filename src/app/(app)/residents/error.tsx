"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function ResidentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="py-10">
      <ErrorState description="We couldn't load residents. Please try again — if the problem continues, contact support." onRetry={reset} />
    </div>
  );
}
