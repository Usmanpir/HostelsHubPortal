import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, LinkIcon } from "lucide-react";
import { AuthHeading } from "@/components/auth/auth-card";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { sp } from "@/lib/page-helpers";
import { verifyEmail } from "@/services/auth/auth-service";
import { getRequestMeta } from "@/services/auth/request";

export const metadata: Metadata = {
  title: "Verify email",
  robots: { index: false },
};

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = sp(await searchParams, "token");
  const result = token ? await verifyEmail(token, await getRequestMeta()) : "invalid";
  const user = await getSessionUser();

  if (result === "invalid") {
    return (
      <div>
        <AuthHeading
          icon={LinkIcon}
          title="This link is no longer valid"
          description="Verification links expire after 24 hours and can only be used once. Enter your email to get a fresh one."
        />
        <ResendVerificationForm defaultEmail={user?.email} />
        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link href={user ? "/dashboard" : "/login"}>{user ? "Go to dashboard" : "Back to sign in"}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading
        icon={BadgeCheck}
        title={result === "verified" ? "Email verified" : "Already verified"}
        description={
          result === "verified"
            ? "Thanks for confirming your email address. Your account is fully set up."
            : "This email address was verified earlier — you're good to go."
        }
      />
      <Button asChild className="h-10 w-full">
        <Link href={user ? "/dashboard" : "/login?reason=verified"}>{user ? "Continue" : "Sign in"}</Link>
      </Button>
    </div>
  );
}
