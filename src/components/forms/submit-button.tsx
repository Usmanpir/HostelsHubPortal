"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SubmitButton({
  pending,
  children,
  pendingText = "Saving…",
  className,
  variant,
  form,
}: {
  pending: boolean;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  form?: string;
}) {
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} form={form}>
      {pending ? (
        <>
          <Spinner />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
