"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="py-10">
      <ErrorState onRetry={reset} />
    </div>
  );
}
