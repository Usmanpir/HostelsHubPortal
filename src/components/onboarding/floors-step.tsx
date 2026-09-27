"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Layers, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { onboardingFloorsSchema } from "@/lib/validation/auth";
import { createFloorsAction } from "@/app/onboarding/actions";
import type { OnboardingFloor } from "./types";
import { StepCard, StepFooter } from "./wizard-chrome";

const ORDINALS = ["Ground", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

export function defaultFloorName(n: number) {
  if (n < 0) return `Basement ${Math.abs(n)}`;
  return n < ORDINALS.length ? `${ORDINALS[n]} floor` : `Floor ${n}`;
}

type Draft = { floorNumber: number; name: string };

export function FloorsStep({ hostelId, hostelName, floors }: { hostelId: string; hostelName: string; floors: OnboardingFloor[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const existing = useMemo(() => new Set(floors.map((f) => f.floorNumber)), [floors]);
  const [includeGround, setIncludeGround] = useState(!existing.has(0));
  const [above, setAbove] = useState(floors.length ? 0 : 2);
  const [names, setNames] = useState<Record<number, string>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const topExisting = floors.length ? Math.max(...floors.map((f) => f.floorNumber)) : 0;
  const drafts: Draft[] = useMemo(() => {
    const numbers: number[] = [];
    if (includeGround && !existing.has(0)) numbers.push(0);
    let n = Math.max(1, floors.length ? topExisting + 1 : 1);
    for (let added = 0; added < above; n++) {
      if (existing.has(n)) continue;
      numbers.push(n);
      added++;
    }
    return numbers.filter((num) => !removed.has(num)).map((num) => ({ floorNumber: num, name: names[num] ?? defaultFloorName(num) }));
  }, [includeGround, above, existing, floors.length, topExisting, names, removed]);

  const submit = () => {
    setError(null);
    const parsed = onboardingFloorsSchema.safeParse({ hostelId, floors: drafts });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the floor names.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createFloorsAction(parsed.data);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${result.data.created} floor${result.data.created === 1 ? "" : "s"} added`);
        router.push("/onboarding?step=4");
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <StepCard
      eyebrow="Step 3"
      title="Add floors"
      description={`How is ${hostelName} laid out? We'll name the floors for you — rename any of them before saving.`}
    >
      {floors.length ? (
        <div className="mb-6">
          <p className="text-sm font-medium">Already added</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {floors.map((f) => (
              <li key={f.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs">
                <Layers className="size-3 text-muted-foreground" />
                {f.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <Label htmlFor="include-ground">{existing.has(0) ? "Ground floor already added" : "Include a ground floor"}</Label>
          <Switch id="include-ground" checked={includeGround && !existing.has(0)} disabled={existing.has(0)} onCheckedChange={setIncludeGround} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="floors-above">{floors.length ? "Additional floors above" : "Floors above ground"}</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Fewer floors" onClick={() => setAbove((v) => Math.max(0, v - 1))}>
              <Minus />
            </Button>
            <Input
              id="floors-above"
              type="number"
              inputMode="numeric"
              min={0}
              max={50}
              className="h-7 w-14 text-center"
              value={above}
              onChange={(e) => setAbove(Math.min(50, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
            />
            <Button type="button" variant="outline" size="icon-sm" aria-label="More floors" onClick={() => setAbove((v) => Math.min(50, v + 1))}>
              <Plus />
            </Button>
          </div>
        </div>
      </div>

      {drafts.length ? (
        <ol className="mt-5 grid gap-2" aria-label="Floors to add">
          {drafts.map((d) => (
            <li key={d.floorNumber} className="flex items-center gap-3">
              <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-xs font-medium tabular text-muted-foreground">
                {d.floorNumber === 0 ? "G" : d.floorNumber}
              </span>
              <label className="sr-only" htmlFor={`floor-name-${d.floorNumber}`}>
                Name of floor {d.floorNumber}
              </label>
              <Input
                id={`floor-name-${d.floorNumber}`}
                value={d.name}
                maxLength={60}
                onChange={(e) => setNames((prev) => ({ ...prev, [d.floorNumber]: e.target.value }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${d.name || "floor"}`}
                onClick={() => setRemoved((prev) => new Set(prev).add(d.floorNumber))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {floors.length ? "No new floors to add. Continue to create rooms." : "Choose how many floors your hostel has."}
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <StepFooter
        step={3}
        skipTo={floors.length ? (drafts.length ? 4 : undefined) : 6}
        skipLabel={floors.length ? "Continue without adding" : "Skip rooms setup"}
      >
        {drafts.length ? (
          <Button type="button" className="h-9 px-4" onClick={submit} disabled={pending}>
            {pending ? <Spinner /> : null}
            Add {drafts.length} floor{drafts.length === 1 ? "" : "s"}
            {pending ? null : <ArrowRight />}
          </Button>
        ) : floors.length ? (
          <Button asChild className="h-9 px-4">
            <Link href="/onboarding?step=4">
              Continue
              <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </StepFooter>
    </StepCard>
  );
}
