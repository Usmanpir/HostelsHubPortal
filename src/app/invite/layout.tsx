import { BrandLogo } from "@/components/marketing/brand";

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-linear-to-b from-primary/10 to-transparent" />
      <header className="relative flex items-center justify-center px-4 py-6">
        <BrandLogo />
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
