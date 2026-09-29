import type { HostelGender, HostelType, PropertyKind, RentalMode, RoomType } from "@/generated/prisma/enums";

/** Plain, serializable shapes passed from the onboarding page to step components. */

export type PlanSummary = {
  key: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  currency: string;
  trialDays: number;
  highlights: string[];
};

export type OnboardingHostel = {
  id: string;
  name: string;
  code: string;
  type: HostelType;
  gender: HostelGender;
  kind: PropertyKind;
  rentalMode: RentalMode;
  city: string | null;
  address: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  amenities: string[];
  rules: string | null;
  status: string;
  defaultBedRent: number | null;
  defaultDeposit: number | null;
  admissionFee: number | null;
  rentDueDay: number;
  lateFeeAmount: number | null;
  lateFeeGraceDays: number;
  managerStaffId: string | null;
};

export type OnboardingRoom = {
  id: string;
  roomNumber: string;
  roomType: RoomType;
  capacity: number;
  rent: number | null;
  bedCount: number;
};

export type OnboardingFloor = {
  id: string;
  name: string;
  floorNumber: number;
  rooms: OnboardingRoom[];
};
