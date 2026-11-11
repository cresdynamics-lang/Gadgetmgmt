import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function InsightsLayout({ children }: { children: ReactNode }) {
  await requirePage("/insights");
  return children;
}
