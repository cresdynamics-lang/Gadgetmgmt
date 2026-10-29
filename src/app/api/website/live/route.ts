import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canUseCapability, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { getSetting, setSetting } from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";
import { parseWebsiteLiveSnapshot, WEBSITE_LIVE_KEY, websiteLiveStale } from "@/lib/website-live";
import { assertWebsiteSync } from "@/lib/website-sync-auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "website.view") && !canUseCapability(session.user, "inventory")) {
    return denied(session.user, "website.view", "Your role cannot view website live data.");
  }
  const snapshot = parseWebsiteLiveSnapshot(await getSetting(WEBSITE_LIVE_KEY));
  const [orders, messages] = await Promise.all([
    prisma.websiteOrder.count(),
    prisma.websiteMessage.count(),
  ]);
  return NextResponse.json({
    live: snapshot,
    orders,
    messages,
    stale: websiteLiveStale(snapshot),
  });
}

export async function POST(request: Request) {
  const authCheck = assertWebsiteSync(request);
  if (!authCheck.ok) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Enter a valid live snapshot." }, { status: 400 });
  }
  const snapshot = { ...(body as Record<string, unknown>), updatedAt: new Date().toISOString() };
  await setSetting(WEBSITE_LIVE_KEY, JSON.stringify(snapshot));
  return NextResponse.json({ ok: true });
}
