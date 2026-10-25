import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { runCollectionsJob } from "@/lib/collections-job";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await runCollectionsJob());
  } catch (error) {
    console.error("Collections notification job failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Notification job failed. Review server logs." }, { status: 500 });
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user, "notifications.view") || !hasPermission(session.user, "scope.allBranches")) {
    return NextResponse.json({ error: "Only a super admin can run reminders now." }, { status: 403 });
  }
  try {
    return NextResponse.json(await runCollectionsJob());
  } catch (error) {
    console.error("Collections notification job failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Notification job failed. Review server logs." }, { status: 500 });
  }
}
