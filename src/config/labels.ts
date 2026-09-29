/**
 * Human-readable labels and badge tones for database enums. Shared by server
 * and client code; keep in sync with prisma/schema.prisma.
 */
import type {
  AnnouncementAudience,
  AnnouncementCategory,
  ApprovalStatus,
  AssignmentStatus,
  AttendanceStatus,
  BedStatus,
  ChargeType,
  ComplaintCategory,
  ComplaintStatus,
  EmploymentType,
  ExpenseStatus,
  Gender,
  HostelGender,
  HostelStatus,
  HostelType,
  InvoiceStatus,
  LeaveType,
  MaintenanceCategory,
  MaintenanceStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PayrollStatus,
  Priority,
  ResidentDocumentType,
  ResidentRequestType,
  ResidentStatus,
  RoomStatus,
  RoomType,
  StaffDocumentType,
  StaffStatus,
  StaffType,
  SubscriptionStatus,
} from "@/generated/prisma/enums";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const hostelTypeLabels: Record<HostelType, string> = {
  BOYS: "Boys",
  GIRLS: "Girls",
  FAMILY: "Family",
  STUDENT: "Student",
  WORKING_PROFESSIONALS: "Working professionals",
  MIXED: "Mixed",
  OTHER: "Other",
};

export const hostelGenderLabels: Record<HostelGender, string> = { MALE: "Male", FEMALE: "Female", MIXED: "Mixed" };

export const hostelStatusLabels: Record<HostelStatus, string> = { ACTIVE: "Active", INACTIVE: "Inactive", ARCHIVED: "Archived" };
export const hostelStatusTones: Record<HostelStatus, Tone> = { ACTIVE: "success", INACTIVE: "warning", ARCHIVED: "neutral" };

export const roomTypeLabels: Record<RoomType, string> = {
  SINGLE: "Single",
  DOUBLE: "Double",
  TRIPLE: "Triple",
  FOUR_BED: "Four bed",
  SHARED: "Shared",
  CUSTOM: "Custom",
  STUDIO: "Studio",
  APARTMENT: "Apartment / flat",
  HOUSE: "House",
  PORTION: "Portion",
  SHOP: "Shop",
  OFFICE: "Office",
  WAREHOUSE: "Warehouse",
};

export const roomTypeCapacity: Partial<Record<RoomType, number>> = {
  SINGLE: 1,
  DOUBLE: 2,
  TRIPLE: 3,
  FOUR_BED: 4,
  STUDIO: 1,
  APARTMENT: 1,
  HOUSE: 1,
  PORTION: 1,
  SHOP: 1,
  OFFICE: 1,
  WAREHOUSE: 1,
};

export const roomStatusLabels: Record<RoomStatus, string> = {
  AVAILABLE: "Available",
  PARTIALLY_OCCUPIED: "Partially occupied",
  FULL: "Full",
  MAINTENANCE: "Maintenance",
  RESERVED: "Reserved",
  INACTIVE: "Inactive",
};
export const roomStatusTones: Record<RoomStatus, Tone> = {
  AVAILABLE: "success",
  PARTIALLY_OCCUPIED: "info",
  FULL: "accent",
  MAINTENANCE: "warning",
  RESERVED: "info",
  INACTIVE: "neutral",
};

export const bedStatusLabels: Record<BedStatus, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  RESERVED: "Reserved",
  MAINTENANCE: "Maintenance",
  INACTIVE: "Inactive",
};
export const bedStatusTones: Record<BedStatus, Tone> = {
  AVAILABLE: "success",
  OCCUPIED: "info",
  RESERVED: "accent",
  MAINTENANCE: "warning",
  INACTIVE: "neutral",
};

export const genderLabels: Record<Gender, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

export const residentStatusLabels: Record<ResidentStatus, string> = {
  ACTIVE: "Active",
  NOTICE: "On notice",
  CHECKED_OUT: "Checked out",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
};
export const residentStatusTones: Record<ResidentStatus, Tone> = {
  ACTIVE: "success",
  NOTICE: "warning",
  CHECKED_OUT: "neutral",
  SUSPENDED: "danger",
  ARCHIVED: "neutral",
};

export const residentDocumentTypeLabels: Record<ResidentDocumentType, string> = {
  ID_DOCUMENT: "CNIC / Passport",
  PHOTO: "Photograph",
  ADMISSION_FORM: "Admission form",
  AGREEMENT: "Agreement",
  CLEARANCE: "Clearance",
  OTHER: "Other",
};

export const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  RESERVED: "Reserved",
  ACTIVE: "Active",
  TRANSFERRED: "Transferred",
  COMPLETED: "Checked out",
  CANCELLED: "Cancelled",
};
export const assignmentStatusTones: Record<AssignmentStatus, Tone> = {
  RESERVED: "accent",
  ACTIVE: "success",
  TRANSFERRED: "info",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
};

export const staffTypeLabels: Record<StaffType, string> = {
  MANAGER: "Manager",
  WARDEN: "Warden",
  RECEPTIONIST: "Receptionist",
  SECURITY_GUARD: "Security guard",
  CLEANER: "Cleaner",
  COOK: "Cook",
  MAINTENANCE: "Maintenance",
  ACCOUNTANT: "Accountant",
  OTHER: "Other",
};

export const employmentTypeLabels: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
};

export const staffStatusLabels: Record<StaffStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  TERMINATED: "Terminated",
  RESIGNED: "Resigned",
};
export const staffStatusTones: Record<StaffStatus, Tone> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  TERMINATED: "danger",
  RESIGNED: "neutral",
};

export const staffDocumentTypeLabels: Record<StaffDocumentType, string> = {
  ID_DOCUMENT: "CNIC / Passport",
  PHOTO: "Photograph",
  CONTRACT: "Contract",
  CERTIFICATE: "Certificate",
  OTHER: "Other",
};

export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEAVE: "Leave",
  HALF_DAY: "Half day",
};
export const attendanceStatusTones: Record<AttendanceStatus, Tone> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  LEAVE: "info",
  HALF_DAY: "accent",
};

export const leaveTypeLabels: Record<LeaveType, string> = {
  CASUAL: "Casual",
  SICK: "Sick",
  ANNUAL: "Annual",
  UNPAID: "Unpaid",
  OTHER: "Other",
};

export const approvalStatusLabels: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
export const approvalStatusTones: Record<ApprovalStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export const payrollStatusLabels: Record<PayrollStatus, string> = { PENDING: "Pending", PAID: "Paid", CANCELLED: "Cancelled" };
export const payrollStatusTones: Record<PayrollStatus, Tone> = { PENDING: "warning", PAID: "success", CANCELLED: "neutral" };

export const chargeTypeLabels: Record<ChargeType, string> = {
  MONTHLY_RENT: "Monthly rent",
  SECURITY_DEPOSIT: "Security deposit",
  ADMISSION_FEE: "Admission fee",
  ELECTRICITY: "Electricity",
  GAS: "Gas",
  INTERNET: "Internet",
  MESS: "Mess / food",
  LAUNDRY: "Laundry",
  MAINTENANCE: "Maintenance",
  LATE_FEE: "Late fee",
  OTHER: "Other",
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};
export const invoiceStatusTones: Record<InvoiceStatus, Tone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  PARTIALLY_PAID: "info",
  PAID: "success",
  OVERDUE: "danger",
  CANCELLED: "neutral",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  ONLINE: "Online",
  OTHER: "Other",
};

export const paymentTypeLabels: Record<PaymentType, string> = { PAYMENT: "Payment", ADVANCE: "Advance", REFUND: "Refund" };
export const paymentStatusLabels: Record<PaymentStatus, string> = { COMPLETED: "Completed", VOIDED: "Voided" };
export const paymentStatusTones: Record<PaymentStatus, Tone> = { COMPLETED: "success", VOIDED: "neutral" };

export const expenseStatusLabels: Record<ExpenseStatus, string> = { RECORDED: "Recorded", VOIDED: "Voided" };

export const maintenanceCategoryLabels: Record<MaintenanceCategory, string> = {
  ELECTRICITY: "Electricity",
  PLUMBING: "Plumbing",
  AC: "Air conditioning",
  FURNITURE: "Furniture",
  INTERNET: "Internet",
  CLEANING: "Cleaning",
  WATER: "Water",
  OTHER: "Other",
};

export const priorityLabels: Record<Priority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
export const priorityTones: Record<Priority, Tone> = { LOW: "neutral", MEDIUM: "info", HIGH: "warning", URGENT: "danger" };

export const maintenanceStatusLabels: Record<MaintenanceStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};
export const maintenanceStatusTones: Record<MaintenanceStatus, Tone> = {
  OPEN: "warning",
  ASSIGNED: "info",
  IN_PROGRESS: "accent",
  COMPLETED: "success",
  REJECTED: "neutral",
};

export const complaintCategoryLabels: Record<ComplaintCategory, string> = {
  ROOM: "Room",
  FOOD: "Food",
  CLEANLINESS: "Cleanliness",
  NOISE: "Noise",
  STAFF: "Staff",
  SECURITY: "Security",
  BILLING: "Billing",
  FACILITIES: "Facilities",
  OTHER: "Other",
};

export const complaintStatusLabels: Record<ComplaintStatus, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
export const complaintStatusTones: Record<ComplaintStatus, Tone> = {
  OPEN: "warning",
  UNDER_REVIEW: "info",
  IN_PROGRESS: "accent",
  RESOLVED: "success",
  CLOSED: "neutral",
};

export const announcementAudienceLabels: Record<AnnouncementAudience, string> = {
  EVERYONE: "Everyone",
  RESIDENTS: "Residents",
  STAFF: "Staff",
  SPECIFIC_RESIDENTS: "Specific residents",
};

export const announcementCategoryLabels: Record<AnnouncementCategory, string> = {
  GENERAL: "General",
  RENT_REMINDER: "Rent reminder",
  MAINTENANCE: "Maintenance",
  RULES: "Hostel rules",
  EMERGENCY: "Emergency",
  EVENT: "Event",
};
export const announcementCategoryTones: Record<AnnouncementCategory, Tone> = {
  GENERAL: "neutral",
  RENT_REMINDER: "warning",
  MAINTENANCE: "info",
  RULES: "accent",
  EMERGENCY: "danger",
  EVENT: "success",
};

export const residentRequestTypeLabels: Record<ResidentRequestType, string> = {
  ROOM_CHANGE: "Room change",
  LEAVE: "Leave",
  OTHER: "Other",
};

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  TRIALING: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
  EXPIRED: "Expired",
};
export const subscriptionStatusTones: Record<SubscriptionStatus, Tone> = {
  TRIALING: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  CANCELED: "neutral",
  EXPIRED: "danger",
};

/** Build <Select> options from a label map. */
export function optionsFrom<K extends string>(labels: Record<K, string>) {
  return (Object.entries(labels) as [K, string][]).map(([value, label]) => ({ value, label }));
}
