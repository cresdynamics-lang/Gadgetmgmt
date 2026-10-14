import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const preferenceSchema = z.object({ smsRemindersEnabled: z.boolean(), emailRemindersEnabled: z.boolean() }).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "customers")) return NextResponse.json({ error: "Your role cannot access customer accounts." }, { status: 403 });
  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) },
    select: {
      id: true,
      creditPlans: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          totalAmount: true,
          depositAmount: true,
          balance: true,
          installmentCount: true,
          termMonths: true,
          nextDueDate: true,
          status: true,
          createdAt: true,
          branch: { select: { name: true } },
          product: { select: { name: true, sku: true } },
          sale: { select: { payments: { orderBy: { createdAt: "desc" }, select: { id: true, amount: true, method: true, reference: true, createdAt: true } } } },
          payments: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, amount: true, method: true, reference: true, createdAt: true } },
          installments: { orderBy: { sequence: "asc" }, select: { id: true, sequence: true, amount: true, paidAmount: true, dueDate: true, paidAt: true } },
          paymentRequests: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, amount: true, purpose: true, status: true, mpesaReceipt: true, paidAt: true, createdAt: true } },
          paymentSubmissions: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, reference: true, createdAt: true } },
        },
      },
    },
  });
  if (!customer) return NextResponse.json({ error: "Customer was not found." }, { status: 404 });
  return NextResponse.json(customer, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "customers")) return NextResponse.json({ error: "Your role cannot manage customer preferences." }, { status: 403 });
  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose valid reminder preferences." }, { status: 400 });
  const { id } = await params;
  const customer = await prisma.customer.findFirst({ where: { id, ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) }, select: { id: true } });
  if (!customer) return NextResponse.json({ error: "Customer was not found." }, { status: 404 });
  const anyEnabled = parsed.data.smsRemindersEnabled || parsed.data.emailRemindersEnabled;
  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...parsed.data,
      remindersConsentAt: anyEnabled ? new Date() : null,
    },
    select: { id: true, smsRemindersEnabled: true, emailRemindersEnabled: true, remindersConsentAt: true },
  });
  return NextResponse.json(updated);
}
