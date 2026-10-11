import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "customers")) return NextResponse.json({ error: "Your role cannot access customers." }, { status: 403 });

  const customers = await prisma.customer.findMany({
    where: session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" },
    include: {
      branch: {
        select: {
          name: true,
        },
      },
      _count: { select: { sales: true, creditPlans: true } },
        sales: {
          take: 6,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            paymentMethod: true,
            createdAt: true,
            saleItems: { select: { product: { select: { name: true } }, quantity: true } },
          },
        },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(customers);
}

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  creditLimit: z.number().int().nonnegative().default(0),
  branchId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "customers")) return NextResponse.json({ error: "Your role cannot create customers." }, { status: 403 });

  const parsed = customerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, phone, email and credit limit." }, { status: 400 });

  const branchId = session.user.role === "OWNER" ? parsed.data.branchId ?? session.user.branchId : session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Select a branch before creating a customer." }, { status: 400 });

  const customer = await prisma.customer.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      creditLimit: parsed.data.creditLimit,
      branchId,
    },
    include: { branch: { select: { name: true } } },
  });

  return NextResponse.json(customer, { status: 201 });
}
