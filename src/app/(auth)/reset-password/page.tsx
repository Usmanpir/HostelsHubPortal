import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { AuthHeading } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { sp } from "@/lib/page-helpers";
import { getPasswordResetTokenState } from "@/services/auth/auth-service";

export const metadata: Metadata = {
  title: "Set your password",
  description: "Choose a new password for your account.",
  robots: { index: false },
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = sp(await searchParams, "token");
  const state = await getPasswordResetTokenState(token);

  if (!token || !state.valid) {
    return (
      <div>
        <AuthHeading
          icon={LinkIcon}
          title="This link has expired"
          description="Password links can only be used once and expire after a while. Request a new one and we'll email it to you."
        />
        <div className="flex flex-col gap-2">
          <Button asChild className="h-10 w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <ResetPasswordForm token={token} email={state.email} mode={state.mode} />;
}
