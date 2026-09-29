import NextAuth, { CredentialsSignin } from "next-auth";
import { cookies } from "next/headers";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { hit, RATE_LIMITS, resetRateLimit } from "@/lib/security/rate-limit";
import { recordAudit } from "@/lib/audit";
import { clientIpFromHeaders } from "@/lib/security/request";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}
class AccountLocked extends CredentialsSignin {
  code = "account_locked";
}
class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}
class EmailNotVerified extends CredentialsSignin {
  code = "email_not_verified";
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();
        const { email, password } = parsed.data;
        const ip = clientIpFromHeaders(request.headers);

        const limit = await hit(`login:${ip}:${email}`, RATE_LIMITS.login);
        if (!limit.allowed) throw new TooManyAttempts();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          await burnPasswordCheck(password);
          throw new InvalidCredentials();
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new AccountLocked();
        if (user.status !== "ACTIVE") throw new InvalidCredentials();

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          const failed = user.failedLoginCount + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
              lockedUntil:
                failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
            },
          });
          throw new InvalidCredentials();
        }

        if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerifiedAt && !user.isSuperAdmin) {
          throw new EmailNotVerified();
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await resetRateLimit(`login:${ip}:${email}`);
        await recordAudit({
          userId: user.id,
          action: "auth.login",
          entityType: "User",
          entityId: user.id,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent") ?? undefined,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          sessionVersion: user.sessionVersion,
          isSuperAdmin: user.isSuperAdmin,
        };
      },
    }),
  ],
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token?.uid) {
        await recordAudit({ userId: token.uid, action: "auth.logout", entityType: "User", entityId: token.uid });
      }
    },
  },
});

/** Auth.js session cookie (`__Secure-` prefixed on HTTPS, chunked as `.0`, `.1`… when large). */
const SESSION_COOKIE = /authjs\.session-token(\.\d+)?$/;

async function sessionCookieValue() {
  const jar = await cookies();
  return jar
    .getAll()
    .filter((c) => SESSION_COOKIE.test(c.name))
    .map((c) => c.value)
    .join("");
}

/**
 * Email + password sign-in without a redirect, for server actions. Wrong
 * credentials throw a `CredentialsSignin`, but server-side failures (e.g. a
 * missing AUTH_SECRET) make Auth.js return a bare 500 that `signIn` doesn't
 * surface — so confirm a new session cookie was actually issued.
 */
export async function signInWithPassword(email: string, password: string) {
  const before = await sessionCookieValue();
  await signIn("credentials", { email, password, redirect: false });
  const after = await sessionCookieValue();
  if (!after || after === before) {
    throw new Error("Auth.js did not issue a session cookie — check AUTH_SECRET and the [auth][error] server logs");
  }
}
