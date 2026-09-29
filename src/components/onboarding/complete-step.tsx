"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BedDouble, Building2, DoorOpen, Layers, PartyPopper, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import { completeOnboardingAction } from "@/app/onboarding/actions";
import type { WizardVocabulary } from "./vocabulary";

type Summary = {
  organizationName: string;
  hostelName: string;
  planName: string | null;
  trialEndsAt: Date | string | null;
  floors: number;
  rooms: number;
  beds: number;
  invitations: number;
};

const NEXT_STEPS = [
  { href: "/residents", label: "Add your first resident", description: "Check residents in to beds and start billing." },
  { href: "/hostels/map", label: "Open the bed map", description: "See occupancy across every floor at a glance." },
  { href: "/settings", label: "Review settings", description: "Invoice numbering, tax, branding and notifications." },
];

function nextStepsFor(vocab: WizardVocabulary | undefined) {
  if (!vocab || (vocab.isHostelOrg && !vocab.wholeUnit)) return NEXT_STEPS;
  const tenant = vocab.resident.toLowerCase();
  return [
    { href: "/residents", label: `Add your first ${tenant}`, description: `Move ${vocab.residents.toLowerCase()} in and start billing rent.` },
    { href: "/hostels/map", label: `Open the ${vocab.unit.toLowerCase()} map`, description: "See occupancy across every floor at a glance." },
    NEXT_STEPS[2]!,
  ];
}

export function CompleteStep({ summary, vocab }: { summary: Summary; vocab?: WizardVocabulary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const finish = (href: string) =>
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(result.message ?? "Setup complete");
        router.replace(href);
        router.refresh();
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });

  const stats = [
    { icon: Building2, label: vocab?.property ?? "Hostel", value: summary.hostelName },
    { icon: Layers, label: "Floors", value: summary.floors },
    { icon: DoorOpen, label: vocab?.units ?? "Rooms", value: summary.rooms },
    ...(vocab?.wholeUnit ? [] : [{ icon: BedDouble, label: "Beds", value: summary.beds }]),
    { icon: Users, label: "Invitations", value: summary.invitations },
  ];
  const nextSteps = nextStepsFor(vocab);

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-linear-to-b from-primary/10 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -top-10 inset-e-10 size-40 rounded-full bg-violet/15 blur-3xl" />
      <div className="relative px-5 py-8 text-center sm:px-10 sm:py-10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-violet text-primary-foreground shadow-lg shadow-primary/25">
          <PartyPopper className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{summary.organizationName} is ready</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-pretty text-muted-foreground">
          Your workspace is set up.
          {summary.planName ? ` You're on the ${summary.planName} plan` : ""}
          {summary.trialEndsAt ? ` with a free trial until ${formatDate(summary.trialEndsAt)}.` : summary.planName ? "." : ""}
        </p>

        <dl className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3 text-start sm:grid-cols-5">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="col-span-1 rounded-xl border bg-background/60 p-3 first:col-span-2 sm:first:col-span-1">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5" />
                {label}
              </dt>
              <dd className="mt-1 truncate text-lg font-semibold tracking-tight tabular">{value}</dd>
            </div>
          ))}
        </dl>

        <Button className="mt-8 h-10 px-6" onClick={() => finish("/dashboard")} disabled={pending}>
          {pending ? <Spinner /> : null}
          Open dashboard
          {pending ? null : <ArrowRight />}
        </Button>
      </div>

      <div className="relative border-t px-5 py-6 sm:px-10">
        <h2 className="text-sm font-medium">What&apos;s next</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {nextSteps.map((s) => (
            <li key={s.href}>
              <button
                type="button"
                onClick={() => finish(s.href)}
                disabled={pending}
                className="flex h-full w-full flex-col items-start gap-1 rounded-xl border p-3 text-start transition-colors hover:border-primary/40 hover:bg-accent/30 disabled:opacity-60"
              >
                <span className="text-sm font-medium">{s.label}</span>
                <span className="text-xs text-muted-foreground">{s.description}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Need to change something?{" "}
          <Link href="/onboarding?step=1" className="font-medium text-primary underline-offset-4 hover:underline">
            Go back to the start
          </Link>
        </p>
      </div>
    </section>
  );
}
