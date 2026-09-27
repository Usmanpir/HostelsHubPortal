import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Sparkles } from "lucide-react";
import { AuthHeading } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { sp } from "@/lib/page-helpers";
import { parsePlanKey } from "@/lib/validation/auth";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = {
  title: "Start your free trial",
  description: "Create your account and set up your first hostel in minutes.",
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (await getSessionUser()) redirect("/dashboard");
  const planKey = parsePlanKey(sp(params, "plan"));
  const plan = planKey
    ? await prisma.plan.findFirst({ where: { key: planKey, isActive: true, isPublic: true }, select: { key: true, name: true, trialDays: true } })
    : null;

  return (
    <>
      <AuthHeading
        title="Create your account"
        description="Set up your organization, first hostel and rooms in a few guided steps."
      />
      {plan ? (
        <div className="mb-5 flex items-center gap-2 rounded-lg border bg-accent/40 px-3 py-2 text-sm">
          <Sparkles className="size-4 text-primary" />
          <span>
            <span className="font-medium">{plan.name}</span> selected
            {plan.trialDays > 0 ? ` · starts with a ${plan.trialDays}-day free trial` : ""}
          </span>
        </div>
      ) : null}
      <RegisterForm plan={plan ? planKey : undefined} />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
