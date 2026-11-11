import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function InventoryLayout({ children }: { children: ReactNode }) {
  await requirePage("/inventory");
  return children;
}
