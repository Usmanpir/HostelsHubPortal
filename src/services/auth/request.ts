import "server-only";
import { cookies, headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/security/request";
import { ORG_COOKIE, HOSTEL_COOKIE } from "@/lib/tenant/server";
import type { RequestMeta } from "./auth-service";

/** Client IP + user agent of the current request (for rate limits and audit logs). */
export async function getRequestMeta(): Promise<RequestMeta & { ipAddress: string }> {
  const hdrs = await headers();
  return { ipAddress: clientIpFromHeaders(hdrs), userAgent: hdrs.get("user-agent") };
}

const tenantCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/** Make `organizationId` the active organization for this browser. */
export async function setActiveOrganizationCookie(organizationId: string) {
  const jar = await cookies();
  jar.set(ORG_COOKIE, organizationId, tenantCookieOptions);
  jar.delete(HOSTEL_COOKIE);
}
