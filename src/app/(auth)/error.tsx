"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthHeading } from "@/components/auth/auth-card";

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div>
      <AuthHeading
        icon={AlertTriangle}
        title="Something went wrong"
        description="We couldn't load this page. Please try again — if the problem continues, contact support."
      />
      <div className="flex flex-col gap-2">
        <Button className="h-10 w-full" onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
