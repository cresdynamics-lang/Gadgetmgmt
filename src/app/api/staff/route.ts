import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";

import { auth } from "@/auth";
import { canAssignStaffRole, hasAnyQuery } from "@/lib/access";
import { canUseCapability } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (hasAnyQuery(request.url)) return NextResponse.json({ error: "Staff requests do not accept account details or other query parameters." }, { status: 400, headers: noStore });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (!(await canUseCapability(session.user.role, "staff", session.user.id))) return NextResponse.json({ error: "Your role cannot view staff accounts." }, { status: 403, headers: noStore });

  const users = await prisma.user.findMany({
    where: session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      branch: { select: { id: true, name: true, code: true } },
      _count: { select: { sales: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(users, { headers: noStore });
}

const staffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(72),
  role: z.enum(["OWNER", "BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"]),
  branchId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  if (hasAnyQuery(request.url)) return NextResponse.json({ error: "Staff requests do not accept account details or other query parameters." }, { status: 400, headers: noStore });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (!(await canUseCapability(session.user.role, "staff", session.user.id))) return NextResponse.json({ error: "Your role cannot manage staff accounts." }, { status: 403, headers: noStore });

  if (session.user.role !== "OWNER") return NextResponse.json({ error: "Only the Administrator can provision staff accounts." }, { status: 403, headers: noStore });
  const parsed = staffSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email, role and password of at least 12 characters." }, { status: 400, headers: noStore });
  if (parsed.data.role === "OWNER") return NextResponse.json({ error: "The configured owner is the only owner account." }, { status: 403, headers: noStore });
  if (!canAssignStaffRole(session.user.role, parsed.data.role)) {
    const message = "Only the Administrator can provision staff accounts.";
    return NextResponse.json({ error: message }, { status: 403, headers: noStore });
  }

  const branchId = session.user.role === "OWNER" ? parsed.data.branchId ?? session.user.branchId : session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Assign this staff member to an active branch." }, { status: 400 });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } });
  if (!branch) return NextResponse.json({ error: "Selected branch is unavailable." }, { status: 400 });

  const passwordHash = await hash(parsed.data.password, 12);
  try {
    const user = await prisma.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, passwordHash, role: parsed.data.role, branchId },
      select: { id: true, name: true, email: true, role: true, status: true, branch: { select: { id: true, name: true, code: true } } },
    });
    return NextResponse.json(user, { status: 201, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    }
    console.error("Staff account creation failed.");
    return NextResponse.json({ error: "Staff account could not be created." }, { status: 500 });
  }
}