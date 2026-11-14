import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    pinVersion: number;
    deviceId: string;
    role: string;
    branchId: string | null;
    branchName: string | null;
  }

  interface Session {
    user: {
      id: string;
      deviceId: string;
      role: string;
      branchId: string | null;
      branchName: string | null;
      pages: string[];
      capabilities: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    pinVersion?: number;
    deviceId: string;
    userId: string;
    role: string;
    branchId: string | null;
    branchName: string | null;
    pages?: string[];
    capabilities?: string[];
  }
}