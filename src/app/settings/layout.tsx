import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requirePage("/settings");
  return <AppShell>{children}</AppShell>;
}
