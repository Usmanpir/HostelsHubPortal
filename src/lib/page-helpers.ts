import "server-only";
import { notFound } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

/**
 * Await a service call in a page; NotFound/Forbidden render the 404 page
 * (we don't reveal whether a record exists in another hostel/tenant).
 */
export async function loadOr404<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a search param. */
export function sp(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  const value = Array.isArray(v) ? v[0] : v;
  return value === "" ? undefined : value;
}

export function spNumber(params: SearchParams, key: string, fallback: number) {
  const n = Number(sp(params, key));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Narrow a search param to one of the allowed enum values. */
export function spEnum<T extends string>(params: SearchParams, key: string, allowed: readonly T[]): T | undefined {
  const v = sp(params, key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}
