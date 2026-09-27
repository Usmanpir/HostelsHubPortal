import { z } from "zod";
import { optionalEmail, optionalMoney, optionalPhone, optionalText, requiredText } from "./common";

const hostelTypes = ["BOYS", "GIRLS", "FAMILY", "STUDENT", "WORKING_PROFESSIONALS", "MIXED", "OTHER"] as const;
const hostelGenders = ["MALE", "FEMALE", "MIXED"] as const;
const roomTypes = ["SINGLE", "DOUBLE", "TRIPLE", "FOUR_BED", "SHARED", "CUSTOM"] as const;
const roomStatuses = ["AVAILABLE", "PARTIALLY_OCCUPIED", "FULL", "MAINTENANCE", "RESERVED", "INACTIVE"] as const;
const bedStatuses = ["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "INACTIVE"] as const;

const stringList = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) => {
    const list = Array.isArray(v) ? v : (v ?? "").split(",");
    return [...new Set(list.map((s) => s.trim()).filter(Boolean))].slice(0, 50);
  });

export const hostelSchema = z.object({
  name: requiredText("Hostel name", 120),
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only")
    .transform((v) => v.toUpperCase()),
  type: z.enum(hostelTypes).default("OTHER"),
  gender: z.enum(hostelGenders).default("MIXED"),
  address: optionalText(300),
  city: optionalText(100),
  country: optionalText(100),
  phone: optionalPhone,
  email: optionalEmail,
  description: optionalText(2000),
  managerStaffId: optionalText(64),
  amenities: stringList,
  rules: optionalText(5000),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  defaultBedRent: optionalMoney,
  defaultDeposit: optionalMoney,
  admissionFee: optionalMoney,
  rentDueDay: z.coerce.number().int().min(1).max(28).default(5),
  lateFeeAmount: optionalMoney,
  lateFeeGraceDays: z.coerce.number().int().min(0).max(60).default(5),
});
export type HostelInput = z.input<typeof hostelSchema>;

export const floorSchema = z.object({
  hostelId: z.string().min(1, "Select a hostel"),
  name: requiredText("Floor name", 60),
  floorNumber: z.coerce.number().int().min(-5).max(200),
  description: optionalText(500),
});
export type FloorInput = z.input<typeof floorSchema>;

export const roomSchema = z.object({
  floorId: z.string().min(1, "Select a floor"),
  roomNumber: requiredText("Room number", 20),
  roomType: z.enum(roomTypes).default("SHARED"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(50),
  status: z.enum(roomStatuses).optional(),
  rent: optionalMoney,
  description: optionalText(1000),
  amenities: stringList,
  /** Create this many beds immediately (defaults to capacity on create). */
  createBeds: z.coerce.number().int().min(0).max(50).optional(),
});
export type RoomInput = z.input<typeof roomSchema>;

export const bulkRoomsSchema = z.object({
  floorId: z.string().min(1, "Select a floor"),
  prefix: z.string().trim().max(10).optional().default(""),
  startNumber: z.coerce.number().int().min(0).max(99999),
  count: z.coerce.number().int().min(1).max(100),
  roomType: z.enum(roomTypes).default("SHARED"),
  capacity: z.coerce.number().int().min(1).max(50),
  rent: optionalMoney,
});
export type BulkRoomsInput = z.input<typeof bulkRoomsSchema>;

export const bedSchema = z.object({
  roomId: z.string().min(1, "Select a room"),
  bedNumber: requiredText("Bed number", 20),
  monthlyRent: optionalMoney,
  notes: optionalText(500),
});
export type BedInput = z.input<typeof bedSchema>;

export const bedUpdateSchema = z.object({
  bedNumber: requiredText("Bed number", 20),
  monthlyRent: optionalMoney,
  notes: optionalText(500),
  status: z.enum(bedStatuses),
});
export type BedUpdateInput = z.input<typeof bedUpdateSchema>;

export const HOSTEL_TYPES = hostelTypes;
export const ROOM_TYPES = roomTypes;
export const ROOM_STATUSES = roomStatuses;
export const BED_STATUSES = bedStatuses;
