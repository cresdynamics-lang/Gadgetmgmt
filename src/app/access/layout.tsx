import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function AccessLayout({ children }: { children: ReactNode }) {
  await requirePage("/access");
  return children;
}
