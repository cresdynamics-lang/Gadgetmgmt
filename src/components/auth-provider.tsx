"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";

import { installApiGuard } from "@/lib/api-guard";

installApiGuard();

export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}