"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Building, Check, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveOrganizationAction, signOutAction } from "@/app/(app)/shell-actions";
import { initials } from "@/lib/format";

export function UserMenu({
  name,
  email,
  roleName,
  organizations,
  activeOrganizationId,
}: {
  name: string;
  email: string;
  roleName?: string;
  organizations?: { id: string; name: string }[];
  activeOrganizationId?: string;
}) {
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const switchOrg = (id: string) =>
    startTransition(async () => {
      const result = await setActiveOrganizationAction(id);
      if (!result.ok) toast.error(result.error);
      else router.push("/dashboard");
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
          {roleName ? <span className="mt-1 text-xs font-normal text-muted-foreground">{roleName}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User />
            My account
          </Link>
        </DropdownMenuItem>
        {roleName ? (
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
        ) : null}
        {organizations && organizations.length > 1 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Building />
              Switch organization
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {organizations.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => switchOrg(o.id)}>
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.id === activeOrganizationId ? <Check className="text-primary" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />}
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => setTheme("light")}>
              <Sun /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("dark")}>
              <Moon /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("system")}>
              <Monitor /> System
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => startTransition(() => signOutAction())}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
