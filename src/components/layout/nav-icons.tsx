import {
  BarChart3,
  Building2,
  Handshake,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "@/config/navigation";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  tasks: ListChecks,
  hostels: Building2,
  residents: Users,
  staff: UserCog,
  finance: Wallet,
  operations: Wrench,
  reports: BarChart3,
  settings: Settings,
  audit: ShieldCheck,
  owners: Landmark,
  realEstate: Handshake,
};
