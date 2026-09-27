import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function AdminNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={SearchX}
        title="Not found"
        description="This record doesn't exist or was removed."
        action={
          <Button asChild variant="outline">
            <Link href="/admin">Back to overview</Link>
          </Button>
        }
      />
    </div>
  );
}
