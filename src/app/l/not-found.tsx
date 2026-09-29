import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PublicNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <SearchX className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">This page isn&apos;t available</h1>
      <p className="text-sm text-muted-foreground">
        The property or page you&apos;re looking for may have been sold, rented or taken down.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Go to homepage</Link>
      </Button>
    </main>
  );
}
