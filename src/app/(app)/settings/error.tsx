"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function SettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      title="Couldn't load these settings"
      description="Something went wrong while loading this section. Please try again."
      onRetry={reset}
    />
  );
}
