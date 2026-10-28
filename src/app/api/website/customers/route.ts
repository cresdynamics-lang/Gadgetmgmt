import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { upsertWebsiteCustomer } from "@/lib/upsert-website-customer";
import { assertWebsiteSync } from "@/lib/website-sync-auth";

const leadSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  source: z.enum(["trade-in", "lipa", "checkout"]).optional(),
});

export async function POST(request: Request) {
  const auth = assertWebsiteSync(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = leadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name, email or phone." }, { status: 400 });

  const result = await upsertWebsiteCustomer(prisma, parsed.data);
  if (result.skipped) return NextResponse.json({ ok: true, skipped: true, reason: result.reason });
  return NextResponse.json({ ok: true, id: result.id, created: result.created }, { status: result.created ? 201 : 200 });
}
