"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";

/** Shared UI for route-level error.tsx boundaries. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this page. Please try again — if the problem continues, contact support.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw />
            Try again
          </Button>
        ) : null
      }
    />
  );
}
