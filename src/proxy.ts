import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/auth.config";

/**
 * Optimistic route protection: bounce anonymous visitors from app areas to
 * /login before rendering. This only checks that a session cookie decodes —
 * real authorization (membership, role, hostel access) happens in the server
 * layer on every request.
 */
const { auth } = NextAuth(authConfig);

const PROTECTED = [
  "/dashboard",
  "/tasks",
  "/account",
  "/hostels",
  "/residents",
  "/staff",
  "/finance",
  "/operations",
  "/reports",
  "/audit-log",
  "/settings",
  "/onboarding",
  "/portal",
  "/admin",
];

const AUTH_PAGES = ["/login", "/register"];

export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  const signedIn = !!req.auth?.user;

  if (!signedIn && PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
