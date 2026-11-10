import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

export async function notificationApi(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    unstable_rethrow(error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("Notification request failed", code);
    const schemaMissing = code === "P2021" || code === "P2022";
    return NextResponse.json({ error: schemaMissing
      ? "Notification storage is not ready. Apply the notification database migration."
      : "Notifications are temporarily unavailable. Please try again." }, { status: 503 });
  }
}
