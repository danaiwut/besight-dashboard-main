import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role?: "admin" | "member";
      memberId?: number;
      adminId?: number;
      tokenVersion?: number;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "admin" | "member";
    memberId?: number;
    adminId?: number;
    tokenVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "member";
    memberId?: number;
    adminId?: number;
    tokenVersion?: number;
  }
}
