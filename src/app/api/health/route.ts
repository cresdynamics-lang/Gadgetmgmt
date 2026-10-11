import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    await prisma.$queryRaw`SELECT 1 as ok`;

    return NextResponse.json({
      ok: true,
      database: "postgresql",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check database query failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Database unavailable",
      },
      { status: 500 },
    );
  }
}
