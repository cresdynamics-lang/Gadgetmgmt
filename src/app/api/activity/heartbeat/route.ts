import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { endUserSession, touchUserSession } from "@/lib/activity";

export async function POST(request: Request) {
  const session = await auth();
  const sessionId = session?.user.sessionId;
  if (!sessionId) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { end?: boolean };
  if (body.end) await endUserSession(sessionId);
  else await touchUserSession(sessionId);
  return NextResponse.json({ ok: true });
}
