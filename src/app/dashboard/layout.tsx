import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requirePage("/dashboard");
  return <AppShell>{children}</AppShell>;
}
