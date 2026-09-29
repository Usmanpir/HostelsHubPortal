"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function OwnersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="py-10">
      <ErrorState
        title="Couldn't load owners"
        description="Something went wrong while loading owner data. Please try again — if the problem continues, contact support."
        onRetry={reset}
      />
    </div>
  );
}
