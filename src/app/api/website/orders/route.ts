import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { upsertWebsiteCustomer } from "@/lib/upsert-website-customer";
import { assertWebsiteSync } from "@/lib/website-sync-auth";

const itemSchema = z.object({
  id: z.string().max(120).optional(),
  name: z.string().max(200),
  qty: z.number().int().positive().max(99),
  kes: z.number().int().nonnegative().max(2_000_000_000),
  href: z.string().max(300).optional(),
}).passthrough();

const upsertSchema = z.object({
  externalId: z.string().trim().min(3).max(80),
  status: z.string().trim().min(2).max(40),
  intent: z.string().trim().max(40).optional(),
  customerName: z.string().trim().min(1).max(160),
  customerPhone: z.string().trim().min(6).max(40),
  customerEmail: z.string().trim().max(160).optional(),
  fulfillment: z.string().trim().max(40).optional(),
  deliveryAddress: z.string().trim().max(400).optional(),
  notes: z.string().trim().max(500).optional(),
  subtotalKes: z.number().int().nonnegative().max(2_000_000_000),
  catalogKes: z.number().int().nonnegative().max(2_000_000_000),
  paidAmount: z.number().int().nonnegative().max(2_000_000_000).optional(),
  paymentMethod: z.string().trim().max(40).optional(),
  paymentRef: z.string().trim().max(120).optional(),
  paidAt: z.string().datetime().optional(),
  items: z.array(itemSchema).min(1).max(50),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "website.view") && !canUseCapability(session.user, "inventory")) {
    return denied(session.user, "website.view", "Your role cannot view website orders.");
  }
  const orders = await prisma.websiteOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const authCheck = assertWebsiteSync(request);
  if (!authCheck.ok) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid website order." }, { status: 400 });

  const data = parsed.data;
  const paidAt = data.paidAt ? new Date(data.paidAt) : data.status === "paid" ? new Date() : null;
  await upsertWebsiteCustomer(prisma, {
    name: data.customerName,
    phone: data.customerPhone,
    email: data.customerEmail,
    source: data.intent === "lipa" ? "lipa" : "checkout",
  }).catch((error) => console.error("Website customer retain failed", error));
  const order = await prisma.websiteOrder.upsert({
    where: { externalId: data.externalId },
    create: {
      externalId: data.externalId,
      status: data.status,
      intent: data.intent || "purchase",
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail || "",
      fulfillment: data.fulfillment || "pickup",
      deliveryAddress: data.deliveryAddress || null,
      notes: data.notes || null,
      subtotalKes: data.subtotalKes,
      catalogKes: data.catalogKes,
      paidAmount: data.paidAmount ?? (data.status === "paid" ? data.subtotalKes : 0),
      paymentMethod: data.paymentMethod || null,
      paymentRef: data.paymentRef || null,
      paidAt,
      items: data.items as Prisma.InputJsonValue,
      rawPayload: data as Prisma.InputJsonValue,
    },
    update: {
      status: data.status,
      intent: data.intent || "purchase",
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail || "",
      fulfillment: data.fulfillment || "pickup",
      deliveryAddress: data.deliveryAddress || null,
      notes: data.notes || null,
      subtotalKes: data.subtotalKes,
      catalogKes: data.catalogKes,
      paidAmount: data.paidAmount ?? (data.status === "paid" ? data.subtotalKes : 0),
      paymentMethod: data.paymentMethod || null,
      paymentRef: data.paymentRef || null,
      paidAt,
      items: data.items as Prisma.InputJsonValue,
      rawPayload: data as Prisma.InputJsonValue,
    },
  });
  return NextResponse.json({ ok: true, id: order.id, externalId: order.externalId });
}
