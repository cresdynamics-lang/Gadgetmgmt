import type { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { hasSensitiveQuery } from "@/lib/access";

function rejectSensitiveQuery(request: NextRequest) {
  if (!hasSensitiveQuery(request.nextUrl.searchParams)) return null;
  return Response.json(
    { error: "Credentials and account details must be submitted in the request body, not the URL." },
    { status: 400, headers: { "cache-control": "no-store" } },
  );
}

export function GET(request: NextRequest) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  return handlers.GET(request);
}

export function POST(request: NextRequest) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  return handlers.POST(request);
}
