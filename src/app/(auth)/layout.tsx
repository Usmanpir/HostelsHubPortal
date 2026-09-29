import Link from "next/link";
import { BrandLogo } from "@/components/marketing/brand";
import { AuthVisual } from "@/components/auth/auth-visual";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { APP_NAME } from "@/config/defaults";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative isolate flex flex-col px-4 py-6 sm:px-10">
        {/* Soft brand wash on small screens, where the illustration panel is hidden. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-linear-to-b from-primary/8 to-transparent lg:hidden"
        />
        <header className="flex items-center justify-between gap-2">
          <BrandLogo />
          <div className="flex items-center gap-1">
            <Link href="/" className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Back to site
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
            {children}
          </div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            © {new Date().getFullYear()} {APP_NAME}
          </span>
          <nav className="flex gap-4" aria-label="Support">
            <Link href="/#faq" className="hover:text-foreground">
              Help
            </Link>
            <Link href="/#contact" className="hover:text-foreground">
              Contact
            </Link>
          </nav>
        </footer>
      </div>
      <aside className="hidden border-s lg:block" aria-hidden>
        <AuthVisual />
      </aside>
    </div>
  );
}
