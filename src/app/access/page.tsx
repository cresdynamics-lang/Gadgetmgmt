import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { EntitlementEditor } from "./entitlement-editor";

export const instant = false;

export default async function AccessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER") notFound();

  return (
    <AppShell>
      <EntitlementEditor />
    </AppShell>
  );
}
