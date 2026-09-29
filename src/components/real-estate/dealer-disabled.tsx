import Link from "next/link";
import { Handshake, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { DEALER_SETTINGS_HREF } from "@/config/real-estate-labels";

/** Shown on Sales & leasing pages while the module is switched off for the organization. */
export function DealerDisabled({ title, canEnable }: { title: string; canEnable: boolean }) {
  return (
    <>
      <PageHeader title={title} breadcrumbs={[{ label: "Sales & leasing" }, { label: title }]} />
      <EmptyState
        icon={Handshake}
        title="Sales & leasing is turned off"
        description={
          canEnable
            ? "Enable Sales & leasing in Settings → Business & modules to manage listings, leads, viewings, deals and commissions."
            : "Ask an organization admin to enable Sales & leasing in Settings → Business & modules."
        }
        action={
          canEnable ? (
            <Button asChild>
              <Link href={DEALER_SETTINGS_HREF}>
                <Settings />
                Open Business & modules
              </Link>
            </Button>
          ) : null
        }
      />
    </>
  );
}
