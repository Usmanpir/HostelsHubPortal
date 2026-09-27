import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Resident photo (served privately via /api/files) with an initials fallback. */
export function ResidentAvatar({
  name,
  photoFileId,
  size = "default",
  className,
}: {
  name: string;
  photoFileId?: string | null;
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
}) {
  return (
    <Avatar size={size === "xl" ? "lg" : size} className={cn(size === "xl" && "size-14", className)}>
      {photoFileId ? <AvatarImage src={`/api/files/${photoFileId}`} alt="" /> : null}
      <AvatarFallback className={cn("bg-accent font-medium text-accent-foreground", size === "xl" && "text-lg")}>
        {initials(name) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
