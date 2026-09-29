import Link from "next/link";
import { Handshake, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

/** Shown on every owners page while the organization has the module switched off. */
export function OwnersModuleDisabled({ canEnable, title = "Owners" }: { canEnable: boolean; title?: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={Handshake}
        title="Enable the Owners module in Settings"
        description={
          canEnable
            ? "Track landlords, link their properties, generate monthly owner statements and record payouts. Switch it on under Settings → Business."
            : "Your organization hasn't switched on the Owners module. Ask an administrator to enable it under Settings → Business."
        }
        action={
          canEnable ? (
            <Button asChild>
              <Link href="/settings/business">
                <Settings />
                Open business settings
              </Link>
            </Button>
          ) : null
        }
      />
    </>
  );
}
