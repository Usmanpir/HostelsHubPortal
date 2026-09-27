import type { NextAuthConfig } from "next-auth";

/**
 * Auth.js configuration shared by the full server instance (src/auth.ts) and
 * the lightweight proxy instance. It must not import the database.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.sv = user.sessionVersion ?? 0;
        token.sa = user.isSuperAdmin ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
        session.user.sessionVersion = token.sv ?? 0;
        session.user.isSuperAdmin = token.sa ?? false;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
