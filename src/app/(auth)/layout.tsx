import Link from "next/link";
import { BrandLogo } from "@/components/marketing/brand";
import { AuthVisual } from "@/components/auth/auth-visual";
import { APP_NAME } from "@/config/defaults";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <BrandLogo />
          <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Back to site
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
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
