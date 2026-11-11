import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function LayawayLayout({ children }: { children: ReactNode }) {
  await requirePage("/layaway");
  return children;
}
