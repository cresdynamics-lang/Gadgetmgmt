import { NotificationRequestError } from "./notification-security";
import { rejectSensitiveQuery } from "./request-guards";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

export async function notificationApi(action: () => Promise<Response>, request?: Request) {
  try {
    const rejected = request ? rejectSensitiveQuery(request) : null;
    const response = rejected ?? await action();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  catch (error) {
    unstable_rethrow(error);
    if (error instanceof NotificationRequestError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store", ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("Notification request failed", code);
    const schemaMissing = code === "P2021" || code === "P2022";
    return NextResponse.json({ error: schemaMissing
      ? "Notification storage is not ready. Apply the notification database migration."
      : "Notifications are temporarily unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
