"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthHeading } from "@/components/auth/auth-card";

export default function InviteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div>
      <AuthHeading
        icon={AlertTriangle}
        title="We couldn't load this invitation"
        description="Please try again in a moment. If it keeps happening, ask for a new invitation link."
      />
      <div className="flex flex-col gap-2">
        <Button className="h-10 w-full" onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/">Go to homepage</Link>
        </Button>
      </div>
    </div>
  );
}
