import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function InventoryLayout({ children }: { children: ReactNode }) {
  await requirePage("/inventory");
  return <AppShell>{children}</AppShell>;
}
