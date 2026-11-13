import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { customerDirectory } from "@/lib/customer-directory";
import { canUseCapability } from "@/lib/entitlements";
import { rejectSensitiveQuery } from "@/lib/request-guards";
import { prisma } from "@/lib/prisma";
const customerSchema = z.object({
  marketingSource: z.string().trim().max(120).optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  creditLimit: z.number().int().nonnegative().default(0),
  smsRemindersEnabled: z.boolean().default(false),
  emailRemindersEnabled: z.boolean().default(false),
  whatsappRemindersEnabled: z.boolean().default(false),
  branchId: z.string().cuid().optional(),
});

export async function GET(request: Request) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await canUseCapability(session.user.role, "customers", session.user.id))) return NextResponse.json({ error: "Your role cannot access customers." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  if (["q", "email", "phone", "name"].some((key) => params.has(key))) {
    return NextResponse.json({ error: "Customer details must be sent in the request body, not the URL." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const filter = params.get("filter") ?? "ALL";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const ownerBranch = session.user.role === "OWNER" ? params.get("branchId") : null;
  return NextResponse.json(await customerDirectory(session.user, { filter, page, branchId: ownerBranch }), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await canUseCapability(session.user.role, "customers", session.user.id))) return NextResponse.json({ error: "Your role cannot create customers." }, { status: 403 });

  const parsed = customerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, phone, email and credit limit." }, { status: 400 });

  const branchId = session.user.role === "OWNER" ? parsed.data.branchId ?? session.user.branchId : session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Select a branch before creating a customer." }, { status: 400 });

  const customer = await prisma.customer.create({
    data: {
      marketingSource: parsed.data.marketingSource || null, name: parsed.data.name, phone: parsed.data.phone, email: parsed.data.email || null,
      creditLimit: parsed.data.creditLimit, smsRemindersEnabled: parsed.data.smsRemindersEnabled,
      emailRemindersEnabled: parsed.data.emailRemindersEnabled, whatsappRemindersEnabled: parsed.data.whatsappRemindersEnabled,
      whatsappConsentAt: parsed.data.whatsappRemindersEnabled ? new Date() : null,
      remindersConsentAt: parsed.data.smsRemindersEnabled || parsed.data.emailRemindersEnabled ? new Date() : null,
      branchId,
    },
    include: { branch: { select: { name: true } } },
  });
  return NextResponse.json(customer, { status: 201 });
}
