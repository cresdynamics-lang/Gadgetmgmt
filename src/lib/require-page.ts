import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { canAccessPage } from "@/lib/entitlements";

export async function requirePage(pathname: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await canAccessPage(session.user.role, pathname))) notFound();
  return session;
}
