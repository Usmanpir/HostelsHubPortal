import Link from "next/link";
import { BedDouble } from "lucide-react";
import { APP_NAME } from "@/config/defaults";
import { cn } from "@/lib/utils";

/** Product logo mark (icon tile + wordmark). Pure CSS/Lucide, no image assets. */
export function BrandMark({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary to-violet text-primary-foreground shadow-sm ring-1 ring-primary/20",
        size === "sm" ? "size-7" : "size-8",
        className,
      )}
    >
      <BedDouble className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  );
}

export function BrandLogo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}
    >
      <BrandMark />
      <span className="text-base">{APP_NAME}</span>
    </Link>
  );
}
