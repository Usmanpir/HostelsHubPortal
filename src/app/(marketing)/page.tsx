import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  Building2,
  CalendarCheck,
  Check,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  History,
  KeyRound,
  Layers,
  MessageSquareQuote,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/defaults";
import { getSessionUser } from "@/lib/auth/session";
import { listPublicPlans } from "@/services/auth/onboarding-service";
import { ContactForm } from "@/components/marketing/contact-form";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { PricingTable } from "@/components/marketing/pricing";
import {
  DashboardMock,
  HostelsMock,
  InvoiceMock,
  PortalMock,
  ReportsMock,
  ResidentMock,
  StaffMock,
} from "@/components/marketing/mocks";
import { cn } from "@/lib/utils";

const TITLE = `${APP_NAME} — Hostel management software for every property you run`;
const DESCRIPTION =
  "Manage all your hostels from one powerful platform: rooms and beds, residents, staff, rent billing, maintenance and reports — with a self-service portal for residents.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    siteName: APP_NAME,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  ...(process.env.NEXT_PUBLIC_APP_URL ? { metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL) } : {}),
};

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Building2, title: "Multi-hostel", text: "Run every property from one account and switch between them in a click." },
  { icon: BedDouble, title: "Rooms & beds", text: "Floors, rooms and beds with a live, colour-coded bed map." },
  { icon: Users, title: "Residents", text: "Profiles, documents, guardians, check-in, transfers and check-out." },
  { icon: CreditCard, title: "Billing", text: "Monthly rent invoices, partial payments, advances, refunds and receipts." },
  { icon: KeyRound, title: "Staff & roles", text: "Invite your team with role-based permissions scoped to specific hostels." },
  { icon: Wrench, title: "Operations", text: "Maintenance requests, complaints, visitor logs and announcements." },
  { icon: BarChart3, title: "Reports", text: "Occupancy, collections, dues and expenses — exportable to Excel and CSV." },
  { icon: History, title: "Audit trail", text: "Every important change is logged with who did it and when." },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: UserPlus, title: "Create your account", text: "Sign up in a minute and start a free trial — no card required." },
  { icon: Layers, title: "Map your property", text: "Add hostels, generate floors and rooms in bulk; beds are created for you." },
  { icon: ClipboardList, title: "Check residents in", text: "Assign beds, record deposits and store documents in one flow." },
  { icon: CreditCard, title: "Collect and track", text: "Bill rent every month, record payments and watch dues in real time." },
];

const FAQS: FaqItem[] = [
  {
    question: "Can I manage more than one hostel?",
    answer:
      "Yes. Every organization can run multiple hostels. A header switcher filters the whole app to one property, or you can view everything at once. Staff can be limited to the hostels they work in.",
  },
  {
    question: "How does the free trial work?",
    answer:
      "Every plan starts with a free trial and no payment details. You get the full feature set of your chosen plan during the trial and can change plans at any time.",
  },
  {
    question: "Can residents log in?",
    answer:
      "Yes. Residents get their own portal to see invoices and payments, raise maintenance requests and complaints, and read announcements. They only ever see their own records.",
  },
  {
    question: "Which currencies and time zones are supported?",
    answer:
      "You choose your currency and time zone when you set up your organization. Amounts, due dates and reports all follow those settings.",
  },
  {
    question: "Is my data kept separate from other operators?",
    answer:
      "Yes. Every record belongs to one organization and every request is checked against your membership and role on the server, so one operator can never see another's data.",
  },
  {
    question: "Can I export my data?",
    answer: "Lists and reports can be exported to CSV or Excel, depending on your plan.",
  },
  {
    question: "Do I need to install anything?",
    answer: `No. ${APP_NAME} runs in the browser on desktop, tablet and phone.`,
  },
];

export default async function LandingPage() {
  const [user, plans] = await Promise.all([getSessionUser(), listPublicPlans()]);
  const signedIn = !!user;
  const trialDays = plans.find((p) => p.priceMonthly <= 0 && p.trialDays > 0)?.trialDays ?? plans.find((p) => p.trialDays > 0)?.trialDays;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-0 top-0 h-[36rem] bg-linear-to-b from-primary/10 via-violet/5 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
          <div className="absolute -top-40 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center sm:px-6 sm:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <span className="size-1.5 rounded-full bg-success" />
            Built for hostels, PGs and student housing
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Manage all your hostels from one powerful platform.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            Beds, residents, staff, rent and maintenance for every property you run — organised in one calm workspace, with a
            portal your residents will actually use.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {signedIn ? (
              <Button asChild size="lg" className="h-11 px-6 text-base">
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="h-11 px-6 text-base">
                <Link href="/register">
                  Start free trial
                  <ArrowRight />
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant="outline" className="h-11 px-6 text-base">
              <Link href="#contact">
                <CalendarCheck />
                Book a demo
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {trialDays ? `${trialDays}-day free trial` : "Free trial"} · No credit card required · Set up in minutes
          </p>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="relative">
            <div aria-hidden className="absolute -inset-4 -z-10 rounded-[2rem] bg-linear-to-b from-primary/15 to-transparent blur-2xl" />
            <div aria-hidden>
              <DashboardMock />
            </div>
            <p className="sr-only">Illustration of the dashboard with occupancy, rent collection and a bed map.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <Section id="features" eyebrow="Features" title="Everything a hostel operator needs" description="One system instead of registers, spreadsheets and chat groups.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="group rounded-2xl border bg-card p-5 transition-colors hover:border-primary/30">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" eyebrow="How it works" title="From sign-up to first rent run in an afternoon" muted>
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="relative rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular">
                  {i + 1}
                </span>
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Spotlight
        id="multi-hostel"
        eyebrow="Multi-hostel management"
        title="Every property, one login"
        text="See occupancy and dues across all your hostels, or focus on one with the hostel switcher. Each property keeps its own floors, rooms, rent defaults and rules."
        points={["Portfolio-wide dashboard", "Per-hostel rent, deposit and late-fee settings", "Staff restricted to the hostels they manage"]}
        visual={<HostelsMock />}
      />
      <Spotlight
        id="residents"
        eyebrow="Resident management"
        title="Know who is in every bed"
        text="Check residents in to a specific bed, keep ID documents and guardian contacts on file, and handle transfers and check-outs without losing history."
        points={["Guided check-in with rent and deposit", "Bed transfers with full history", "Documents stored privately"]}
        visual={<ResidentMock />}
        reverse
      />
      <Spotlight
        id="staff"
        eyebrow="Staff management"
        title="Your team, with the right access"
        text="Invite managers, wardens, accountants and security staff. Track attendance and leave, run payroll, and give each role exactly the permissions it needs."
        points={["Role-based permissions", "Attendance, leave and payroll", "Per-hostel access control"]}
        visual={<StaffMock />}
      />
      <Spotlight
        id="billing"
        eyebrow="Billing"
        title="Rent collection without the chasing"
        text="Generate monthly invoices, record cash, bank transfer or card payments, apply advances and issue receipts. Outstanding balances and overdue invoices are always visible."
        points={["Monthly invoice runs", "Partial payments, advances and refunds", "Printable receipts"]}
        visual={<InvoiceMock />}
        reverse
      />
      <Spotlight
        id="reports"
        eyebrow="Reports"
        title="Numbers you can act on"
        text="Occupancy, revenue, collections, expenses and dues by hostel and period. Export any report when your accountant asks."
        points={["Occupancy and vacancy trends", "Revenue vs expenses", "Excel and CSV exports"]}
        visual={<ReportsMock />}
      />
      <Spotlight
        id="resident-portal"
        eyebrow="Resident portal"
        title="Self-service for residents"
        text="Residents sign in to see their invoices and payments, raise maintenance requests and complaints, and read announcements — fewer calls to the front desk."
        points={["Invoices and payment history", "Maintenance and complaint tracking", "Announcements and notices"]}
        visual={<PortalMock />}
        reverse
      />

      {/* Testimonials — intentionally placeholders until real customer stories are collected. */}
      <Section
        id="stories"
        eyebrow="Customer stories"
        title="Your story could be here"
        description={`We're collecting stories from operators using ${APP_NAME}. Run your hostels with us and tell us how it's going.`}
        muted
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-4 rounded-2xl border border-dashed bg-card/60 p-6">
              <MessageSquareQuote className="size-6 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">Your story here</p>
              <div className="mt-auto flex items-center gap-3">
                <span className="size-9 rounded-full border border-dashed" />
                <span className="flex flex-col gap-1.5">
                  <span className="h-2 w-24 rounded-full bg-muted" />
                  <span className="h-2 w-16 rounded-full bg-muted/70" />
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already a customer?{" "}
          <Link href="#contact" className="font-medium text-primary underline-offset-4 hover:underline">
            Share your experience
          </Link>
        </p>
      </Section>

      {/* Pricing */}
      <Section
        id="pricing"
        eyebrow="Pricing"
        title="Simple plans that grow with you"
        description="Start free, then pick the plan that fits the number of hostels and beds you run."
      >
        <PricingTable plans={plans} signedIn={signedIn} />
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="FAQ" title="Questions, answered" muted>
        <div className="mx-auto max-w-3xl">
          <Faq items={FAQS} />
        </div>
      </Section>

      {/* CTA */}
      <section className="px-4 py-20 sm:px-6">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-linear-to-br from-primary to-violet px-6 py-14 text-center text-primary-foreground shadow-2xl shadow-primary/20 sm:px-12">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.12)_1px,transparent_1px)] bg-size-[20px_20px]" />
          <ShieldCheck className="relative mx-auto size-8 opacity-90" />
          <h2 className="relative mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Bring every hostel under one roof.
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-pretty opacity-90 sm:text-base">
            Set up your organization, first hostel and rooms in a guided wizard. Invite your team when you&apos;re ready.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="secondary" className="h-11 px-6 text-base">
              <Link href={signedIn ? "/dashboard" : "/register"}>
                {signedIn ? "Open dashboard" : "Start free trial"}
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="h-11 px-6 text-base text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
            >
              <Link href="#contact">Talk to us</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Contact / Book a demo */}
      <section id="contact" className="scroll-mt-20 border-t px-4 py-20 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <p className="text-sm font-medium text-primary">Book a demo</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">See {APP_NAME} with your own setup</h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              Tell us a little about your hostels and we&apos;ll walk you through bed allocation, billing and reporting — and
              answer your questions about moving over from registers or spreadsheets.
            </p>
            <ul className="mt-6 grid gap-3 text-sm">
              {["A walkthrough tailored to your properties", "Answers on pricing and getting started", "No obligation — start your trial whenever you like"].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <MiniCard icon={Smartphone} title="Works on any device" text="Desktop, tablet and phone." />
              <MiniCard icon={FileSpreadsheet} title="Export anytime" text="Your data, in CSV or Excel." />
            </div>
          </div>
          <ContactForm />
        </div>
      </section>
    </>
  );
}

function Section({
  id,
  eyebrow,
  title,
  description,
  muted,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-20 sm:px-6", muted && "border-y bg-muted/30")} aria-labelledby={`${id}-title`}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h2>
          {description ? <p className="mt-3 text-pretty text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function Spotlight({
  id,
  eyebrow,
  title,
  text,
  points,
  visual,
  reverse,
}: {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20 px-4 py-16 sm:px-6" aria-labelledby={`${id}-title`}>
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn(reverse && "lg:order-2")}>
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-2 text-3xl font-semibold tracking-tight text-balance">
            {title}
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">{text}</p>
          <ul className="mt-6 grid gap-3 text-sm">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <Check className="size-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className={cn("relative", reverse && "lg:order-1")} aria-hidden>
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-linear-to-br from-primary/10 via-transparent to-violet/10 blur-2xl" />
          <div className="mx-auto max-w-md">{visual}</div>
        </div>
      </div>
    </section>
  );
}

function MiniCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <Icon className="mt-0.5 size-5 text-primary" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
