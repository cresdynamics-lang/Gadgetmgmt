import { NextResponse } from "next/server";

import { hasSensitiveQuery } from "@/lib/access";

const noStore = { "Cache-Control": "no-store" };

export function rejectSensitiveQuery(request: Request) {
  let params: URLSearchParams;
  try {
    params = new URL(request.url).searchParams;
  } catch {
    return NextResponse.json({ error: "This request could not be read." }, { status: 400, headers: noStore });
  }
  if (!hasSensitiveQuery(params)) return null;
  return NextResponse.json(
    { error: "Credentials and account details must not be sent in the URL." },
    { status: 400, headers: noStore },
  );
}
