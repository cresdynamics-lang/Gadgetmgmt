import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasAnyQuery, parseEntitlementUpdate, ROLE_IDS } from "@/lib/access";
import { getAccessMap } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

const noStore = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export async function GET(request: Request) {
  if (hasAnyQuery(request.url)) return json({ error: "This request does not accept account details or other query parameters." }, 400);
  const session = await auth();
  if (!session?.user) return json({ error: "Authentication required" }, 401);
  if (session.user.role !== "OWNER") return json({ error: "Only the Gadgethub owner can view role entitlements." }, 403);

  const grants = await getAccessMap();
  return json({
    grants: ROLE_IDS.map((role) => ({
      role,
      pages: grants[role].pages,
      capabilities: grants[role].capabilities,
    })),
  });
}

export async function PUT(request: Request) {
  if (hasAnyQuery(request.url)) return json({ error: "This request does not accept account details or other query parameters." }, 400);
  const session = await auth();
  if (!session?.user) return json({ error: "Authentication required" }, 401);
  if (session.user.role !== "OWNER") return json({ error: "Only the Gadgethub owner can edit role entitlements." }, 403);

  const parsed = parseEntitlementUpdate(await request.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    await prisma.$transaction(
      ROLE_IDS.map((role) =>
        prisma.roleEntitlement.upsert({
          where: { role },
          create: { role, pages: parsed.grants[role].pages, capabilities: parsed.grants[role].capabilities },
          update: { pages: parsed.grants[role].pages, capabilities: parsed.grants[role].capabilities },
        }),
      ),
    );
  } catch {
    console.error("Role entitlements could not be saved.");
    return json({ error: "Role entitlements could not be saved." }, 500);
  }

  const grants = parsed.grants;
  return json({
    grants: ROLE_IDS.map((role) => ({
      role,
      pages: grants[role].pages,
      capabilities: grants[role].capabilities,
    })),
  });
}
