"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl py-10">
      <ErrorState
        title="We couldn't load this step"
        description="Your progress is saved. Try again — if the problem continues, contact support."
        onRetry={reset}
      />
    </div>
  );
}
