import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requirePage("/settings");
  return children;
}
