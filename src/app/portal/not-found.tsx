import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function PortalNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={SearchX}
        title="Not found"
        description="This record doesn't exist or isn't linked to your account."
        action={
          <Button asChild variant="outline">
            <Link href="/portal">Back to home</Link>
          </Button>
        }
      />
    </div>
  );
}
