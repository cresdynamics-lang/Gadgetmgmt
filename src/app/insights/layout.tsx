import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function InsightsLayout({ children }: { children: ReactNode }) {
  await requirePage("/insights");
  return <AppShell>{children}</AppShell>;
}
