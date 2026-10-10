import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const branches = await prisma.branch.findMany({
    where: session.user.role === "OWNER" ? {} : { id: session.user.branchId ?? "" },
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      phone: true,
      email: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(branches);
}
