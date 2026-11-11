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

test("push refreshes open clients and handles empty payloads", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: string[] = [];
  const messages: unknown[] = [];
  runInNewContext(readFileSync("public/notifications-sw.js", "utf8"), { URL, self: {
    location: { origin: "https://app.example" }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; },
    registration: { showNotification: async (title: string) => { shown.push(title); } },
    clients: { matchAll: async () => [{ postMessage: (value: unknown) => { messages.push(value); } }] },
  } });
  let pending: Promise<unknown> | undefined;
  handlers.push({ data: { json: () => null }, waitUntil(promise: Promise<unknown>) { pending = promise; } });
  await pending;
  assert.deepEqual(shown, ["GadgetHub alert"]);
  assert.equal((messages[0] as { type: string }).type, "NOTIFICATIONS_CHANGED");
});

test("service worker never intercepts API fetches or caches authenticated navigation", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  let intercepted = false;
  runInNewContext(readFileSync("public/notifications-sw.js", "utf8"), { URL, self: {
    location: { origin: "https://app.example" }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; },
  } });
  handlers.fetch({ request: { mode: "cors", url: "https://app.example/api/notifications/inbox" }, respondWith() { intercepted = true; } });
  assert.equal(intercepted, false);
});

test("installed Web Push exports generate a usable VAPID key pair", async () => {
  const push = await import("web-push");
  const keys = push.generateVAPIDKeys();
  assert.equal(keys.publicKey.length, 87);
  assert.equal(keys.privateKey.length, 43);
  assert.doesNotThrow(() => push.setVapidDetails("mailto:admin@company.test", keys.publicKey, keys.privateKey));
});

test("public offline icons are served from cache", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cached = new Response("public icon");
  runInNewContext(readFileSync("public/notifications-sw.js", "utf8"), { URL, caches: { match: async () => cached }, self: {
    location: { origin: "https://app.example" }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; },
  } });
  let pending: Promise<Response> | undefined;
  handlers.fetch({ request: { method: "GET", mode: "no-cors", url: "https://app.example/notifications-icon-192.png" }, respondWith(promise: Promise<Response>) { pending = promise; } });
  assert.equal(await (await pending!).text(), "public icon");
});

test("Prisma schema and generated client retain the notification storage contract", async () => {
  const { Prisma } = await import("@prisma/client");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  for (const name of ["StaffAlert", "StaffAlertDelivery", "PushSubscription", "NotificationEmailSettings"]) {
    assert.ok(schema.includes(`model ${name} {`), `${name} must remain in the Prisma schema`);
    assert.ok(Prisma.dmmf.datamodel.models.some((model) => model.name === name), `${name} must be present in the generated client; run npm run db:generate`);
  }
});

test("only administrators configure company email; all staff can access notification controls", async () => {
  const { canAccessPage, canUseCapability } = await import("../src/lib/access");
  for (const role of ["OWNER", "BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"]) {
    assert.equal(canUseCapability(role, "companyEmailSettings"), role === "OWNER");
    assert.equal(canAccessPage(role, "/notifications"), true);
  }
  assert.equal(canUseCapability("UNKNOWN", "companyEmailSettings"), false);
});

test("notification writes accept an explicit LAN origin without trusting arbitrary hosts", () => {
  const previous = { APP_BASE_URL: process.env.APP_BASE_URL, NOTIFICATION_ALLOWED_ORIGINS: process.env.NOTIFICATION_ALLOWED_ORIGINS };
  try {
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.NOTIFICATION_ALLOWED_ORIGINS = " http://192.168.1.2:3000,invalid-value ";
    const request = (origin: string) => new Request("http://localhost:3000/api/notifications/inbox", { headers: { origin, host: "192.168.1.2:3000", "x-forwarded-host": "evil.example" } });
    assert.equal(sameOrigin(request("http://192.168.1.2:3000")), true);
    assert.equal(sameOrigin(request("http://localhost:3000")), true);
    assert.equal(sameOrigin(request("http://192.168.1.2:3001")), false);
    assert.equal(sameOrigin(request("https://192.168.1.2:3000")), false);
    assert.equal(sameOrigin(request("https://evil.example")), false);
    assert.equal(sameOrigin(request("null")), false);
    assert.equal(sameOrigin(request("http://192.168.1.2:3000.evil.example")), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
