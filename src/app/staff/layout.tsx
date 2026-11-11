import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function StaffLayout({ children }: { children: ReactNode }) {
  await requirePage("/staff");
  return children;
}
