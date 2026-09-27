import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Circle, DoorOpen, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = { title: string; description: string; href: string; cta: string; done: boolean; allowed: boolean; icon: typeof Building2 };

/** First-run guide for a brand-new organization. */
export function DashboardEmpty({
  setup,
  permissions,
}: {
  setup: { hostels: number; rooms: number; residents: number };
  permissions: ReadonlySet<string>;
}) {
  const steps: Step[] = [
    {
      title: "Add your first hostel",
      description: "Name, address, rent defaults and house rules.",
      href: "/hostels/new",
      cta: "Add hostel",
      done: setup.hostels > 0,
      allowed: permissions.has("hostels.manage"),
      icon: Building2,
    },
    {
      title: "Create floors, rooms and beds",
      description: "Bulk-add rooms — beds are generated automatically.",
      href: "/hostels/rooms",
      cta: "Set up rooms",
      done: setup.rooms > 0,
      allowed: permissions.has("rooms.manage"),
      icon: DoorOpen,
    },
    {
      title: "Register residents",
      description: "Add residents and check them in to a bed.",
      href: "/residents/new",
      cta: "Add resident",
      done: setup.residents > 0,
      allowed: permissions.has("residents.manage"),
      icon: UserPlus,
    },
  ];
  const next = steps.find((s) => !s.done && s.allowed);
  return (
    <div className="rounded-xl border bg-card p-6 sm:p-8">
      <div className="max-w-xl">
        <h2 className="text-lg font-semibold tracking-tight">Let&apos;s set up your property</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your dashboard fills in with occupancy, revenue and activity as soon as you add a hostel. Three steps get you running.
        </p>
      </div>
      <ol className="mt-6 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.href} className={cn("flex flex-col gap-3 rounded-lg border p-4", next === s && "border-primary/40 bg-accent/30")}>
            <div className="flex items-center gap-2">
              {s.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
              <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <s.icon className="size-4" />
              </span>
              <div>
                <div className="font-medium">{s.title}</div>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
            </div>
            {s.allowed && !s.done ? (
              <Button asChild size="sm" variant={next === s ? "default" : "outline"} className="mt-auto self-start">
                <Link href={s.href}>
                  {s.cta}
                  <ArrowRight className="rtl:rotate-180" />
                </Link>
              </Button>
            ) : !s.allowed && !s.done ? (
              <p className="mt-auto text-xs text-muted-foreground">Ask an administrator to complete this step.</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
