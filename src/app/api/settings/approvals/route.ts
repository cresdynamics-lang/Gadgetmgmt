import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { getApprovalCodeEmail, setApprovalCodeEmail } from "@/lib/app-settings";
import { denied } from "@/lib/authz";

const updateSchema = z.object({
  email: z.string().trim().max(254),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "permissions.manage")) return denied(session.user, "permissions.manage", "Only the super admin can change approval settings.");
  return NextResponse.json({ email: await getApprovalCodeEmail() });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "permissions.manage")) return denied(session.user, "permissions.manage", "Only the super admin can change approval settings.");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the email that should receive approval codes." }, { status: 400 });
  try {
    const email = await setApprovalCodeEmail(parsed.data.email);
    return NextResponse.json({ email });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The approval email could not be saved." }, { status: 400 });
  }
}
