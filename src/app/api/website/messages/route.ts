import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { upsertWebsiteCustomer } from "@/lib/upsert-website-customer";
import { assertWebsiteSync } from "@/lib/website-sync-auth";

const messageSchema = z.object({
  id: z.string().trim().min(3).max(80),
  kind: z.enum(["contact", "newsletter", "track"]).default("contact"),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(40),
  topic: z.string().trim().max(80).optional(),
  message: z.string().trim().max(2000).optional(),
  orderRef: z.string().trim().max(60).optional(),
  createdAt: z.string().trim().max(40).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "website.view") && !canUseCapability(session.user, "inventory")) {
    return denied(session.user, "website.view", "Your role cannot view website messages.");
  }
  const messages = await prisma.websiteMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const authCheck = assertWebsiteSync(request);
  if (!authCheck.ok) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid website message." }, { status: 400 });
  const data = parsed.data;
  await upsertWebsiteCustomer(prisma, {
    name: data.name,
    phone: data.phone,
    source: "checkout",
  }).catch((error) => console.error("Website message customer retain failed", error));
  const row = await prisma.websiteMessage.upsert({
    where: { externalId: data.id },
    create: {
      externalId: data.id,
      kind: data.kind,
      name: data.name,
      phone: data.phone,
      topic: data.topic || null,
      body: data.message || null,
      orderRef: data.orderRef || null,
      createdAt: data.createdAt && Number.isFinite(Date.parse(data.createdAt)) ? new Date(data.createdAt) : new Date(),
    },
    update: {
      kind: data.kind,
      name: data.name,
      phone: data.phone,
      topic: data.topic || null,
      body: data.message || null,
      orderRef: data.orderRef || null,
    },
  });
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
