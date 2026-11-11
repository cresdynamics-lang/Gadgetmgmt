import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function CreditLayout({ children }: { children: ReactNode }) {
  await requirePage("/credit");
  return children;
}
