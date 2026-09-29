import type { ApprovalStatus, AssignmentStatus, ResidentRequestType, ResidentStatus } from "@/generated/prisma/enums";
import { APPROVAL_STATUSES, ASSIGNMENT_STATUSES, REQUEST_TYPES, RESIDENT_STATUSES } from "@/lib/validation/resident";
import type { ResidentListFilters, ResidentSort } from "./resident-service";
import type { AssignmentListFilters } from "./assignment-service";
import type { RequestListFilters } from "./request-service";

/** Search params from a page (`Record<string, string | string[]>`) or a URLSearchParams. */
type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string | undefined {
  const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === null || v === undefined || v === "" ? undefined : v;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const SORTS: readonly ResidentSort[] = ["name", "code", "joined", "hostel", "status", "created"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseResidentFilters(params: Params): ResidentListFilters {
  return {
    q: get(params, "q")?.slice(0, 100),
    status: oneOf<ResidentStatus | "ALL">(get(params, "status"), [...RESIDENT_STATUSES, "ALL"]),
    hostelId: get(params, "hostelId") ?? null,
    assigned: oneOf(get(params, "assigned"), ["yes", "no"] as const),
    sort: oneOf(get(params, "sort"), SORTS),
    dir: oneOf(get(params, "dir"), ["asc", "desc"] as const),
    page: positiveInt(get(params, "page"), 1),
    pageSize: Math.min(positiveInt(get(params, "pageSize"), 20), 100),
  };
}

export function parseAssignmentFilters(params: Params): AssignmentListFilters {
  const from = get(params, "from");
  const to = get(params, "to");
  return {
    q: get(params, "q")?.slice(0, 100),
    status: oneOf<AssignmentStatus>(get(params, "status"), ASSIGNMENT_STATUSES),
    hostelId: get(params, "hostelId") ?? null,
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
    expiring: get(params, "lease") === "expiring" || undefined,
    page: positiveInt(get(params, "page"), 1),
    pageSize: Math.min(positiveInt(get(params, "pageSize"), 20), 100),
  };
}

export function parseRequestFilters(params: Params): RequestListFilters {
  return {
    q: get(params, "q")?.slice(0, 100),
    status: oneOf<ApprovalStatus | "ALL">(get(params, "status"), [...APPROVAL_STATUSES, "ALL"]),
    type: oneOf<ResidentRequestType>(get(params, "type"), REQUEST_TYPES),
    hostelId: get(params, "hostelId") ?? null,
    residentId: get(params, "residentId"),
    page: positiveInt(get(params, "page"), 1),
    pageSize: Math.min(positiveInt(get(params, "pageSize"), 20), 100),
  };
}
