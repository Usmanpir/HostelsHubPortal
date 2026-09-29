/**
 * Bulk resident import: column layout shared by the template download, the
 * file parser, the preview table and the error report.
 */

export const IMPORT_COLUMNS = [
  { key: "hostel", header: "Hostel", required: true, example: "ISB-BH", hint: "Hostel code or exact name" },
  { key: "firstName", header: "First name", required: true, example: "Ali" },
  { key: "lastName", header: "Last name", required: true, example: "Khan" },
  { key: "phone", header: "Phone", required: true, example: "+92 300 1234567" },
  { key: "joiningDate", header: "Joining date", required: true, example: "2026-01-15", hint: "YYYY-MM-DD or DD/MM/YYYY" },
  { key: "status", header: "Status", required: false, example: "Active", hint: "Active, On notice, Suspended or Checked out (default Active)" },
  { key: "room", header: "Room", required: false, example: "101", hint: "Leave empty to add without a bed" },
  { key: "bed", header: "Bed", required: false, example: "1", hint: "Required when Room is set" },
  { key: "checkInDate", header: "Check-in date", required: false, example: "2026-01-15", hint: "Defaults to the joining date" },
  { key: "monthlyRent", header: "Monthly rent", required: false, example: "15000", hint: "Defaults to the bed/room/hostel rent" },
  { key: "securityDeposit", header: "Security deposit", required: false, example: "15000" },
  { key: "email", header: "Email", required: false, example: "ali.khan@example.com" },
  { key: "alternatePhone", header: "Alternate phone", required: false, example: "" },
  { key: "gender", header: "Gender", required: false, example: "Male", hint: "Male, Female or Other" },
  { key: "dateOfBirth", header: "Date of birth", required: false, example: "2002-05-20" },
  { key: "idNumber", header: "CNIC / Passport", required: false, example: "61101-1234567-1" },
  { key: "nationality", header: "Nationality", required: false, example: "Pakistani" },
  { key: "address", header: "Address", required: false, example: "" },
  { key: "city", header: "City", required: false, example: "Lahore" },
  { key: "occupation", header: "Occupation", required: false, example: "Student" },
  { key: "institution", header: "Institute / Company", required: false, example: "NUST" },
  { key: "expectedLeavingDate", header: "Expected leaving date", required: false, example: "" },
  { key: "leavingDate", header: "Leaving date", required: false, example: "", hint: "For Checked out residents" },
  { key: "emergencyContactName", header: "Emergency contact name", required: false, example: "Ahmed Khan" },
  { key: "emergencyContactPhone", header: "Emergency contact phone", required: false, example: "+92 321 7654321" },
  { key: "emergencyContactRelation", header: "Emergency contact relation", required: false, example: "Father" },
  { key: "guardianName", header: "Guardian name", required: false, example: "" },
  { key: "guardianPhone", header: "Guardian phone", required: false, example: "" },
  { key: "notes", header: "Notes", required: false, example: "" },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];
export type RawImportRow = Partial<Record<ImportColumnKey, string>>;

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
/** Rows sent per import request (keeps each request short). */
export const IMPORT_BATCH_SIZE = 50;

export type ImportRowStatus = "ready" | "duplicate" | "invalid";

export type PreviewRow = {
  /** 1-based spreadsheet row number (header is row 1). */
  rowNumber: number;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  data: RawImportRow;
  /** Resolved placement, for display. */
  placement: string | null;
};

export type ImportRowResult = {
  rowNumber: number;
  outcome: "imported" | "skipped" | "duplicate" | "failed";
  message: string;
  residentId?: string;
  residentCode?: string;
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<string, ImportColumnKey> = {
  hostelcode: "hostel",
  hostelname: "hostel",
  firstname: "firstName",
  lastname: "lastName",
  surname: "lastName",
  mobile: "phone",
  phonenumber: "phone",
  contact: "phone",
  joiningdate: "joiningDate",
  joindate: "joiningDate",
  admissiondate: "joiningDate",
  roomnumber: "room",
  roomno: "room",
  bednumber: "bed",
  bedno: "bed",
  checkindate: "checkInDate",
  rent: "monthlyRent",
  monthlyrent: "monthlyRent",
  deposit: "securityDeposit",
  securitydeposit: "securityDeposit",
  cnic: "idNumber",
  passport: "idNumber",
  cnicpassport: "idNumber",
  idnumber: "idNumber",
  dob: "dateOfBirth",
  dateofbirth: "dateOfBirth",
  institute: "institution",
  company: "institution",
  institutecompany: "institution",
  institution: "institution",
  leavingdate: "leavingDate",
  checkoutdate: "leavingDate",
  expectedleavingdate: "expectedLeavingDate",
};
for (const c of IMPORT_COLUMNS) {
  HEADER_ALIASES[normalizeHeader(c.header)] = c.key;
  HEADER_ALIASES[normalizeHeader(c.key)] = c.key;
}

/** Map a spreadsheet header to a column key (tolerant of case, spaces and common synonyms). */
export function columnForHeader(header: string): ImportColumnKey | undefined {
  return HEADER_ALIASES[normalizeHeader(header)];
}
