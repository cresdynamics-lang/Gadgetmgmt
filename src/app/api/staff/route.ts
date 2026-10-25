import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, canUseCapability, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { recordActivity } from "@/lib/activity";
import { queueAndSendNotice } from "@/lib/customer-notice";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "staff")) return denied(session.user, "staff", "Your role cannot view staff accounts.");

  const users = await prisma.user.findMany({
    where: canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      branch: { select: { id: true, name: true, code: true } },
      _count: { select: { sales: true } },
      permissionGrants: { select: { permission: true, mode: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(users);
}

const staffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(72),
  role: z.enum(["OWNER", "BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"]),
  branchId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "staff.manage")) return denied(session.user, "staff.manage", "Your permissions cannot manage staff accounts.");

  const parsed = staffSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email, role and password of at least 12 characters." }, { status: 400 });
  if (!canSeeAllBranches(session.user) && parsed.data.role !== "CASHIER" && parsed.data.role !== "INVENTORY_LEAD") {
    return NextResponse.json({ error: "Your permissions can create cashier or inventory lead accounts only." }, { status: 403 });
  }

  const branchId = canSeeAllBranches(session.user) ? parsed.data.branchId ?? session.user.branchId : session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Assign this staff member to an active branch." }, { status: 400 });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } });
  if (!branch) return NextResponse.json({ error: "Selected branch is unavailable." }, { status: 400 });

  const passwordHash = await hash(parsed.data.password, 12);
  try {
    const user = await prisma.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, passwordHash, role: parsed.data.role, branchId },
      select: { id: true, name: true, email: true, role: true, status: true, branch: { select: { id: true, name: true, code: true } } },
    });
    await recordActivity({
      userId: session.user.id,
      sessionId: session.user.sessionId,
      action: "STAFF_CREATED",
      summary: `Created ${user.role} account for ${user.name}`,
      entityType: "User",
      entityId: user.id,
    });
    const appUrl = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
    // The password is never emailed; the admin shares it privately.
    await queueAndSendNotice({
      branchId,
      channel: "EMAIL",
      kind: "STAFF_WELCOME",
      recipient: user.email,
      subject: "Your Gadget Hub staff account is ready",
      body: `Hello ${user.name}, a Gadget Hub staff account has been created for you at ${user.branch?.name ?? "the shop"}.${appUrl ? ` Sign in at ${appUrl}/login` : " Sign in on the Gadget Hub app"} with ${user.email}. Your manager will give you your first password in person. If you did not expect this email, please ignore it.`,
      dedupeKey: `staff-welcome:${user.id}`,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    }
    console.error("Staff account creation failed", error);
    return NextResponse.json({ error: "Staff account could not be created." }, { status: 500 });
  }
}