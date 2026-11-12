import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function CustomersLayout({ children }: { children: ReactNode }) {
  await requirePage("/customers");
  return <AppShell>{children}</AppShell>;
}
