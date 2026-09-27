/**
 * Typed application errors. Services throw these; the API/action layers map
 * them to HTTP status codes and user-friendly messages. Anything else is
 * treated as an internal error and its details are never sent to the client.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PLAN_LIMIT"
  | "BUSINESS_RULE"
  | "INTERNAL_ERROR";

export type FieldErrors = Record<string, string[] | undefined>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;

  constructor(code: ErrorCode, message: string, status: number, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please check the highlighted fields.", fieldErrors?: FieldErrors) {
    super("VALIDATION_ERROR", message, 422, fieldErrors);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You need to sign in to continue.") {
    super("UNAUTHENTICATED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to perform this action.") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super("NOT_FOUND", `${entity} not found.`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please wait a moment and try again.") {
    super("RATE_LIMITED", message, 429);
  }
}

export class PlanLimitError extends AppError {
  constructor(message: string) {
    super("PLAN_LIMIT", message, 402);
  }
}

/** A domain rule was violated (e.g. bed already occupied). */
export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super("BUSINESS_RULE", message, 422);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Map Prisma known errors (unique violations etc.) to AppErrors. */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") return new ConflictError("A record with these details already exists.");
    if (code === "P2025") return new NotFoundError();
    if (code === "P2003") return new ConflictError("This record is linked to other records and cannot be changed.");
  }
  return new AppError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
}
