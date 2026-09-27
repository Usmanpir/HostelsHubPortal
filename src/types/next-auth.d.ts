import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
    isSuperAdmin?: boolean;
  }

  interface Session {
    user: {
      id: string;
      sessionVersion: number;
      isSuperAdmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    sv?: number;
    sa?: boolean;
  }
}
