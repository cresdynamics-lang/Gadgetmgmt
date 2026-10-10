import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    branchId: string | null;
    branchName: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      branchId: string | null;
      branchName: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: string;
    branchId: string | null;
    branchName: string | null;
  }
}