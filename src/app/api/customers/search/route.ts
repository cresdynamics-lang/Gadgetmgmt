import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { customerDirectory } from "@/lib/customer-directory";
import { canUseCapability } from "@/lib/entitlements";
import { rejectSensitiveQuery } from "@/lib/request-guards";

const searchSchema = z.object({
  q: z.string().max(100).optional(),
  filter: z.string().max(20).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  branchId: z.string().cuid().optional(),
}).strict();

export async function POST(request: Request) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!(await canUseCapability(session.user.role, "customers", session.user.id))) return NextResponse.json({ error: "Your role cannot access customers." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  const parsed = searchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid customer search." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const directory = await customerDirectory(session.user, {
    query: parsed.data.q,
    filter: parsed.data.filter,
    page: parsed.data.page,
    branchId: parsed.data.branchId,
  });
  return NextResponse.json(directory, { headers: { "Cache-Control": "no-store" } });
}
