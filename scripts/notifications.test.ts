import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { alertDeliveryTime, alertInput, sameOrigin } from "../src/lib/staff-alerts";

test("alerts validate content and default to inbox only", () => {
  const result = alertInput.parse({ userId: "manager", title: " Update ", body: " Check stock " });
  assert.equal(result.title, "Update");
  assert.equal(result.body, "Check stock");
  assert.equal(result.email, false);
  assert.equal(result.push, false);
  for (const change of [{ title: " " }, { body: "x".repeat(4001) }, { scheduledAt: "tomorrow" }, { userId: "" }, { email: "true" }]) {
    assert.equal(alertInput.safeParse({ ...result, ...change }).success, false);
  }
});

test("schedules preserve an explicit timezone", () => {
  const input = alertInput.parse({ userId: "manager", title: "Reminder", body: "Review", scheduledAt: "2026-12-01T07:30:00+03:00" });
  assert.equal(new Date(input.scheduledAt!).toISOString(), "2026-12-01T04:30:00.000Z");
});

test("cookie mutations reject foreign and missing origins", () => {
  assert.equal(sameOrigin(new Request("https://app.example/api/notifications", { headers: { origin: "https://app.example" } })), true);
  assert.equal(sameOrigin(new Request("https://app.example/api/notifications", { headers: { origin: "https://evil.example" } })), false);
  assert.equal(sameOrigin(new Request("https://app.example/api/notifications")), false);
});

test("push clicks always open the authenticated inbox, ignoring payload URLs", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const opened: string[] = [];
  runInNewContext(readFileSync("public/notifications-sw.js", "utf8"), { URL, self: {
    location: { origin: "https://app.example" },
    addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; },
    clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } },
  } });
  let pending: Promise<unknown> | undefined;
  handlers.notificationclick({ notification: { close() {}, data: { url: "https://evil.example" } }, waitUntil(promise: Promise<unknown>) { pending = promise; } });
  await pending;
  assert.deepEqual(opened, ["https://app.example/notifications"]);
});

test("send now overrides a future schedule using server time", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const input = alertInput.parse({ userId: "manager", title: "Urgent", body: "Please review", sendNow: true, scheduledAt: "2027-01-01T00:00:00Z" });
  assert.equal(alertDeliveryTime(input, now).getTime(), now.getTime());
  assert.equal(alertDeliveryTime({ ...input, sendNow: false }, now).toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(alertDeliveryTime({ sendNow: false }, now).getTime(), now.getTime());
});

test("notification responses handle empty, truncated and non-JSON bodies", async () => {
  const { notificationResponse } = await import("../src/lib/notification-response");
  for (const body of ["", '{"alerts":', "<html>Server error</html>"]) {
    await assert.rejects(notificationResponse(new Response(body, { status: 500 })), /HTTP 500/);
  }
  await assert.rejects(notificationResponse(new Response("")), /empty or invalid response/);
  await assert.rejects(notificationResponse(new Response("null")), /invalid notification response/);
  await assert.rejects(notificationResponse(Response.json({ error: "Storage unavailable" }, { status: 503 })), /Storage unavailable/);
  assert.deepEqual(await notificationResponse(Response.json({ alerts: [] })), { alerts: [] });
});

test("company sender settings reject invalid addresses and header injection", async () => {
  const { emailSettingsInput } = await import("../src/lib/email-settings-input");
  assert.equal(emailSettingsInput.parse({ senderEmail: " alerts@company.test ", senderName: "Company" }).senderEmail, "alerts@company.test");
  assert.equal(emailSettingsInput.safeParse({ senderEmail: "not-an-email", senderName: "Company" }).success, false);
  assert.equal(emailSettingsInput.safeParse({ senderEmail: "alerts@company.test", senderName: "Company\r\nBcc: other@company.test" }).success, false);
});
