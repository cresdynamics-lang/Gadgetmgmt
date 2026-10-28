import { NextResponse } from "next/server";

import { buildWebsiteCatalogFeed } from "@/lib/website-catalog-feed";
import { assertWebsiteSync } from "@/lib/website-sync-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = assertWebsiteSync(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const feed = await buildWebsiteCatalogFeed(prisma);
  return NextResponse.json(feed, {
    headers: { "Cache-Control": "no-store" },
  });
}
