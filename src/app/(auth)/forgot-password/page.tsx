import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { sp } from "@/lib/page-helpers";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Get a link to reset your password.",
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = sp(await searchParams, "email");
  return <ForgotPasswordForm defaultEmail={email && email.length <= 254 ? email : undefined} />;
}
