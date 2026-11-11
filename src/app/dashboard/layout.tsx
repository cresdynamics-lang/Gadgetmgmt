import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requirePage("/dashboard");
  return children;
}
