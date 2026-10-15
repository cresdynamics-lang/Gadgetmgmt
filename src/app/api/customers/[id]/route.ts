import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const customerUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  creditLimit: z.number().int().nonnegative().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "CREDIT_HOLD"]).optional(),
  smsRemindersEnabled: z.boolean().optional(),
  emailRemindersEnabled: z.boolean().optional(),
  whatsappRemindersEnabled: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0);

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
          lateFeeAmount: true,
          depositAmount: true,
          balance: true,
          installmentCount: true,
          termMonths: true,
          nextDueDate: true,
          status: true,
          imei: true,
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
  const parsed = customerUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid customer details or reminder preferences." }, { status: 400 });
  const profileFields = ["name", "phone", "email", "creditLimit", "status"] as const;
  const isProfileUpdate = profileFields.some((field) => parsed.data[field] !== undefined);
  if (isProfileUpdate && session.user.role !== "OWNER" && session.user.role !== "BRANCH_MANAGER") return NextResponse.json({ error: "Only an owner or branch manager can edit customer details or credit status." }, { status: 403 });
  const { id } = await params;
  const customer = await prisma.customer.findFirst({ where: { id, ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) }, select: { id: true, phone: true, email: true, smsRemindersEnabled: true, emailRemindersEnabled: true, whatsappRemindersEnabled: true, remindersConsentAt: true, whatsappConsentAt: true } });
  if (!customer) return NextResponse.json({ error: "Customer was not found." }, { status: 404 });
  const phoneChanged = parsed.data.phone !== undefined && parsed.data.phone !== customer.phone;
  const emailChanged = parsed.data.email !== undefined && (parsed.data.email || null) !== customer.email;
  const smsEnabled = phoneChanged ? false : parsed.data.smsRemindersEnabled ?? customer.smsRemindersEnabled;
  const emailEnabled = emailChanged ? false : parsed.data.emailRemindersEnabled ?? customer.emailRemindersEnabled;
  const whatsappEnabled = phoneChanged ? false : parsed.data.whatsappRemindersEnabled ?? customer.whatsappRemindersEnabled;
  const reminderChangedToEnabled = (!customer.smsRemindersEnabled && smsEnabled) || (!customer.emailRemindersEnabled && emailEnabled);
  const whatsappChangedToEnabled = !customer.whatsappRemindersEnabled && whatsappEnabled;
  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
      ...(parsed.data.creditLimit !== undefined ? { creditLimit: parsed.data.creditLimit } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.smsRemindersEnabled !== undefined || phoneChanged ? { smsRemindersEnabled: smsEnabled } : {}),
      ...(parsed.data.emailRemindersEnabled !== undefined || emailChanged ? { emailRemindersEnabled: emailEnabled } : {}),
      ...(parsed.data.whatsappRemindersEnabled !== undefined || phoneChanged ? { whatsappRemindersEnabled: whatsappEnabled } : {}),
      remindersConsentAt: !smsEnabled && !emailEnabled ? null : reminderChangedToEnabled ? new Date() : customer.remindersConsentAt,
      whatsappConsentAt: !whatsappEnabled ? null : whatsappChangedToEnabled ? new Date() : customer.whatsappConsentAt,
    },
    select: { id: true, name: true, phone: true, email: true, status: true, creditLimit: true, reliabilityScore: true, smsRemindersEnabled: true, emailRemindersEnabled: true, remindersConsentAt: true, whatsappRemindersEnabled: true, whatsappConsentAt: true },
  });
  return NextResponse.json(updated);
}
