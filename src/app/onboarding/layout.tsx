import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { BrandLogo } from "@/components/marketing/brand";
import { Button } from "@/components/ui/button";
import { requireSessionUser } from "@/lib/auth/session";
import { signOutAction } from "@/app/(app)/shell-actions";

export const metadata: Metadata = {
  title: "Set up your workspace",
  robots: { index: false },
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionUser();
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandLogo href="/onboarding" />
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-muted-foreground sm:inline">{user.email}</span>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}
