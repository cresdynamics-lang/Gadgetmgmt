import type { ReactNode } from "react";

import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  await requirePage("/notifications");
  return children;
}
