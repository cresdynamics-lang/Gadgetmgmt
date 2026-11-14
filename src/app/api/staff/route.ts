import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";

import { auth } from "@/auth";
import { canAssignStaffRole, hasAnyQuery } from "@/lib/access";
import { canUseCapability } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

import { isConfiguredOwner, recordFailure } from "@/lib/auth-security";
import { accountPasswordSchema } from "@/lib/account-password";
import { emailAccountPassword } from "@/lib/account-email";
import { sameOrigin } from "@/lib/staff-alerts";

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

  return NextResponse.json(users, { headers: { ...noStore, "X-Can-Provision-Owners": String(isConfiguredOwner(session.user)) } });
}

const staffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: accountPasswordSchema,
  emailCredentials: z.boolean().default(false),
  actorPassword: z.string().min(1).max(256).optional(),
  role: z.enum(["OWNER", "BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"]),
  branchId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Access denied." }, { status: 403, headers: noStore });
  if (hasAnyQuery(request.url)) return NextResponse.json({ error: "Staff requests do not accept account details or other query parameters." }, { status: 400, headers: noStore });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (!(await canUseCapability(session.user.role, "staff", session.user.id))) return NextResponse.json({ error: "Your role cannot manage staff accounts." }, { status: 403, headers: noStore });

  if (session.user.role !== "OWNER") return NextResponse.json({ error: "Only the Administrator can provision staff accounts." }, { status: 403, headers: noStore });
  const parsed = staffSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email, role and password of at least 12 characters." }, { status: 400, headers: noStore });
  if (parsed.data.role === "OWNER") {
    if (!isConfiguredOwner(session.user)) return NextResponse.json({ error: "Only the configured Owner can create another Owner." }, { status: 403, headers: noStore });
    const actor = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!actor || !parsed.data.actorPassword || !await compare(parsed.data.actorPassword, actor.passwordHash)) {
      if (parsed.data.actorPassword) await recordFailure(session.user.id, "Owner provisioning");
      return NextResponse.json({ error: "Confirm your current password to create an Owner." }, { status: 401, headers: noStore });
    }
  }
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
    const user = await prisma.$transaction(async tx => {
    const created = await tx.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, passwordHash, role: parsed.data.role, branchId, ...(parsed.data.role === "OWNER" ? { ownerApprovedAt: new Date() } : {}) },
      select: { id: true, name: true, email: true, role: true, status: true, branch: { select: { id: true, name: true, code: true } } },
    });
    const event=await tx.authEvent.create({ data: { userId: session.user.id, action: `Created ${parsed.data.role === "OWNER" ? "Owner" : "staff"} account for ${created.email}`, deviceLabel: "Account provisioning" } });
    return {...created,eventId:event.id};
    });
    const {eventId,...account}=user;
    const emailStatus=parsed.data.emailCredentials?await emailAccountPassword({...account,password:parsed.data.password,reset:false,eventId}):"not_requested";
    return NextResponse.json({...account,emailStatus}, { status: 201, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    }
    console.error("Staff account creation failed.");
    return NextResponse.json({ error: "Staff account could not be created." }, { status: 500 });
  }
}