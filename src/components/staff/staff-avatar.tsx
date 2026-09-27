import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Staff photo (served privately via /api/files) with an initials fallback. */
export function StaffAvatar({
  name,
  photoFileId,
  size = "default",
  className,
}: {
  name: string;
  photoFileId?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {photoFileId ? <AvatarImage src={`/api/files/${photoFileId}`} alt="" /> : null}
      <AvatarFallback className={cn("font-medium", size === "lg" && "text-base")}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
