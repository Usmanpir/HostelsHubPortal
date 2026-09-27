import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { sp, spNumber } from "@/lib/page-helpers";
import { parsePlanKey, type OnboardingOrganizationInput } from "@/lib/validation/auth";
import { TRIAL_PLAN_KEY } from "@/config/plans";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import {
  getOnboardingSnapshot,
  getOnboardingStatus,
  listInvitableRoles,
  listPublicPlans,
  loadOnboardingContext,
  ONBOARDING_STEPS,
  TOTAL_STEPS,
} from "@/services/auth/onboarding-service";
import { getRequestMeta } from "@/services/auth/request";
import { planLimitLines } from "@/components/marketing/plan-utils";
import { WizardProgress } from "@/components/onboarding/wizard-chrome";
import { OrganizationStep } from "@/components/onboarding/organization-step";
import { HostelStep } from "@/components/onboarding/hostel-step";
import { FloorsStep } from "@/components/onboarding/floors-step";
import { RoomsStep } from "@/components/onboarding/rooms-step";
import { BedsStep } from "@/components/onboarding/beds-step";
import { TeamStep } from "@/components/onboarding/team-step";
import { CompleteStep } from "@/components/onboarding/complete-step";
import type { PlanSummary } from "@/components/onboarding/types";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSessionUser();
  const params = await searchParams;

  const status = await getOnboardingStatus(user.id);
  // Finished (or joined someone else's organization): nothing to set up here.
  if (status.completed || (status.hasMembership && !status.pendingOrganizationId)) redirect("/dashboard");

  const ctx = await loadOnboardingContext(user.id, await getRequestMeta());
  const requested = sp(params, "step") ? spNumber(params, "step", 1) : null;

  const allPlans = await listPublicPlans();
  const plans: PlanSummary[] = allPlans.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    priceMonthly: p.priceMonthly,
    currency: p.currency,
    trialDays: p.trialDays,
    highlights: planLimitLines(p.limits).slice(0, 3),
  }));
  const fallbackPlan = plans.find((p) => p.key === TRIAL_PLAN_KEY)?.key ?? plans[0]?.key ?? TRIAL_PLAN_KEY;

  if (!ctx) {
    const preselected = parsePlanKey(sp(params, "plan"));
    return (
      <Wizard step={1} maxReachable={1}>
        <OrganizationStep
          isEditing={false}
          plans={plans}
          initial={{
            name: "",
            email: user.email,
            phone: "",
            city: "",
            country: "",
            currency: "PKR",
            timezone: "Asia/Karachi",
            planKey: preselected && plans.some((p) => p.key === preselected) ? preselected : fallbackPlan,
          }}
        />
      </Wizard>
    );
  }

  const snapshot = await getOnboardingSnapshot(ctx);
  const maxReachable = snapshot.hostel ? TOTAL_STEPS : 2;
  const step = Math.min(Math.max(requested ?? snapshot.resumeStep, 1), maxReachable);
  const org = snapshot.organization;

  let content: React.ReactNode;
  switch (step) {
    case 1:
      content = (
        <OrganizationStep
          isEditing
          plans={plans}
          initial={{
            name: org.name,
            email: org.email ?? "",
            phone: org.phone ?? "",
            city: org.city ?? "",
            country: org.country ?? "",
            currency: org.currency,
            timezone: org.timezone as OnboardingOrganizationInput["timezone"],
            planKey: plans.some((p) => p.key === snapshot.planKey) ? snapshot.planKey : fallbackPlan,
          }}
        />
      );
      break;
    case 2:
      content = <HostelStep hostel={snapshot.hostel} currency={org.currency} orgCity={org.city} orgCountry={org.country} />;
      break;
    case 3:
      content = <FloorsStep hostelId={snapshot.hostel!.id} hostelName={snapshot.hostel!.name} floors={snapshot.floors} />;
      break;
    case 4:
      content = <RoomsStep floors={snapshot.floors} currency={org.currency} defaultRent={snapshot.hostel!.defaultBedRent} />;
      break;
    case 5:
      content = <BedsStep floors={snapshot.floors} currency={org.currency} />;
      break;
    case 6: {
      const [roles, hostels] = await Promise.all([listInvitableRoles(ctx), listHostelOptions(ctx)]);
      content = <TeamStep roles={roles} hostels={hostels.map((h) => ({ id: h.id, name: h.name }))} pendingInvites={snapshot.invitations} />;
      break;
    }
    default:
      content = (
        <CompleteStep
          summary={{
            organizationName: org.name,
            hostelName: snapshot.hostel!.name,
            planName: snapshot.planName,
            trialEndsAt: snapshot.trialEndsAt,
            ...snapshot.counts,
          }}
        />
      );
  }

  return (
    <Wizard step={step} maxReachable={maxReachable}>
      {content}
    </Wizard>
  );
}

async function Wizard({ step, maxReachable, children }: { step: number; maxReachable: number; children: React.ReactNode }) {
  const user = await requireSessionUser();
  const firstName = user.name.split(" ")[0] ?? user.name;
  return (
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-1 hidden text-sm text-muted-foreground lg:block">Welcome, {firstName}</p>
        <p className="mb-5 hidden text-lg font-semibold tracking-tight lg:block">Let&apos;s set up your workspace</p>
        <WizardProgress steps={ONBOARDING_STEPS} current={step} maxReachable={maxReachable} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
