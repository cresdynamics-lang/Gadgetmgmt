import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { getOwnerInboxes, OWNER_CC, setOwnerInboxes } from "@/lib/app-settings";
import { denied } from "@/lib/authz";

const updateSchema = z.object({
  email: z.string().trim().max(1000),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "permissions.manage")) return denied(session.user, "permissions.manage", "Only the super admin can change approval settings.");
  return NextResponse.json({ email: (await getOwnerInboxes()).join(", "), cc: OWNER_CC });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "permissions.manage")) return denied(session.user, "permissions.manage", "Only the super admin can change approval settings.");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the owner inbox emails, separated by commas." }, { status: 400 });
  try {
    const inboxes = await setOwnerInboxes(parsed.data.email);
    return NextResponse.json({ email: inboxes.join(", "), cc: OWNER_CC });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The owner inboxes could not be saved." }, { status: 400 });
  }
}
