import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { chromium, expect, type BrowserContext } from "@playwright/test";
import { Queue } from "bullmq";
import { notificationConnection } from "../src/lib/notification-queue";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the isolated test schema.");
  const schema = `notifications_e2e_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("schema", schema);
  const directory = mkdtempSync(join(tmpdir(), "gadgetmgmt-notifications-"));
  const port = Number(process.env.NOTIFICATION_TEST_PORT || 3117);
  const base = `http://127.0.0.1:${port}`;
  const queueName = schema;
  const env = { ...process.env, EMAIL_FROM: "", RESEND_API_KEY: process.env.NOTIFICATION_LIVE_EMAIL ? process.env.RESEND_API_KEY : "test-only", DATABASE_URL: url.href, APP_BASE_URL: base, NEXTAUTH_URL: base, AUTH_URL: base,
    NEXTAUTH_SECRET: randomUUID() + randomUUID(), NEXT_DIST_DIR: ".next-notifications-e2e", NOTIFICATION_QUEUE_NAME: queueName };
  const prisma = new PrismaClient({ datasourceUrl: url.href, log: [] });
  const queue = new Queue(queueName, { connection: notificationConnection() });
  const children: ChildProcess[] = [];
  const start = (args: string[], overrides = {}) => {
    const child = spawn(process.execPath, args, { env: { ...env, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
    const output = createWriteStream(join(directory, `process-${children.length}.log`));
    child.stdout!.pipe(output); child.stderr!.pipe(output); children.push(child);
    return child;
  };
  const stop = async (child: ChildProcess) => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(10_000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const push = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env, encoding: "utf8" });
    assert.equal(push.status, 0, "Could not create the isolated test schema");
    const a = await prisma.branch.create({ data: { name: "Notification test A", code: schema + "a", address: "Test", phone: "0700000000" } });
    const b = await prisma.branch.create({ data: { name: "Notification test B", code: schema + "b", address: "Test", phone: "0700000001" } });
    const password = randomUUID();
    const passwordHash = await hash(password, 10);
    const owner = await prisma.user.create({ data: { name: "Notification Owner", email: "owner@notifications.invalid", passwordHash, role: "OWNER", branchId: a.id } });
    const manager = await prisma.user.create({ data: { name: "Notification Manager", email: "manager@notifications.invalid", passwordHash, role: "BRANCH_MANAGER", branchId: a.id } });
    const cashier = await prisma.user.create({ data: { name: "Notification Cashier", email: "cashier@notifications.invalid", passwordHash, role: "CASHIER", branchId: a.id } });
    const outsider = await prisma.user.create({ data: { name: "Other Branch", email: "other@notifications.invalid", passwordHash, role: "CASHIER", branchId: b.id } });
    const serverArgs = ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)];
    let server = start(serverArgs);
    let restarts = 0;
    await expect.poll(async () => {
      if (server.exitCode !== null) {
        if (restarts++ >= 1) throw new Error("Test server exited; inspect isolated process logs.");
        server = start(serverArgs);
      }
      try {
        const response = await fetch(base + "/api/auth/csrf");
        // Startup advisories can terminate Next immediately after its first response.
        await delay(5000);
        return server.exitCode === null ? response.status : 0;
      } catch { return 0; }
    }, { timeout: 180_000, intervals: [1000] }).toBe(200);
    browser = await chromium.launch({ executablePath: chromium.executablePath(), headless: true, args: ["--no-sandbox"] });
    const login = async (email: string) => {
      const context = await browser!.newContext();
      const page = await context.newPage();
      await page.goto(base + "/login?callbackUrl=/notifications");
      await page.getByLabel("Work email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("heading", { name: /Your inbox/ })).toBeVisible({ timeout: 90_000 });
      return { context, page };
    };
    const unauthorized = await fetch(base + "/api/notifications/inbox");
    assert.equal(unauthorized.status, 401);
    const sender = await login(owner.email);
    await sender.page.getByRole("button", { name: "Configure email", exact: true }).click();
    await sender.page.getByLabel("Company sender email", { exact: true }).fill("notifications@notifications.invalid");
    await sender.page.getByLabel("Sender name", { exact: true }).fill("Fixture Company");
    await sender.page.getByRole("button", { name: "Save email settings", exact: true }).click();
    await expect(sender.page.getByRole("button", { name: "Edit email settings", exact: true })).toBeVisible();
    assert.equal((await prisma.notificationEmailSettings.findUnique({ where: { id: "company" } }))?.senderEmail, "notifications@notifications.invalid");
    console.log("PASS: warning action configures company sender inline and persists settings");
    await sender.page.getByText("Compose an alert", { exact: true }).click();
    await sender.page.getByLabel("Recipient", { exact: true }).selectOption(cashier.id);
    await sender.page.getByLabel("Title", { exact: true }).fill("Immediate integration message");
    await sender.page.getByLabel("Message", { exact: true }).fill("The frontend and backend are connected.");
    const submitted = sender.page.waitForResponse((response) => response.url().endsWith("/api/notifications/inbox") && response.request().method() === "POST");
    await sender.page.getByRole("button", { name: "Send now", exact: true }).click();
    const submittedResponse = await submitted;
    assert.equal(submittedResponse.status(), 201);
    const immediate = await submittedResponse.json();
    const payload = submittedResponse.request().postDataJSON();
    const post = (context: BrowserContext, data: unknown, origin = base) => context.request.post(base + "/api/notifications/inbox", { data, headers: { Origin: origin } });
    const duplicate = await post(sender.context, payload);
    assert.equal((await duplicate.json()).id, immediate.id);
    assert.equal(await prisma.staffAlert.count({ where: { title: payload.title } }), 1);
    assert.equal((await post(sender.context, payload, "https://foreign.invalid")).status(), 403);
    console.log("PASS: browser Send now, persisted inbox, duplicate prevention and origin protection");

    const receiver = await login(cashier.email);
    await expect(receiver.page.getByRole("heading", { name: payload.title })).toBeVisible();
    await expect(receiver.page.getByText("Compose an alert", { exact: true })).toHaveCount(0);
    await receiver.page.getByRole("button", { name: "Mark read", exact: true }).click();
    await expect.poll(async () => (await prisma.staffAlert.findUnique({ where: { id: immediate.id } }))?.readAt !== null).toBe(true);
    assert.equal((await post(receiver.context, payload)).status(), 403);
    assert.equal((await receiver.context.request.get(base + "/api/notifications")).status(), 403);
    const managerSession = await login(manager.email);
    assert.equal((await managerSession.context.request.put(base + "/api/notifications/email-settings", { data: { senderEmail: "wrong@notifications.invalid", senderName: "Wrong" }, headers: { Origin: base } })).status(), 403);
    assert.equal((await post(managerSession.context, { ...payload, requestId: randomUUID(), userId: outsider.id })).status(), 404);
    const unrelated = await managerSession.context.request.get(base + "/api/notifications/inbox");
    assert.equal((await unrelated.json()).alerts.length, 0);
    console.log("PASS: recipient read state, staff access and cross-branch isolation");

    const create = async (title: string, extra = {}) => {
      const response = await post(sender.context, { requestId: randomUUID(), userId: cashier.id, title, body: "Notification integration check", sendNow: true, ...extra });
      assert.equal(response.status(), 201);
      return (await response.json()).id as string;
    };
    const scheduled = await create("Scheduled integration message", { sendNow: false, scheduledAt: new Date(Date.now() + 4000).toISOString() });
    const beforeDue = await receiver.context.request.get(base + "/api/notifications/inbox");
    assert.equal((await beforeDue.json()).alerts.some((alert: { id: string }) => alert.id === scheduled), false);
    await delay(4200);
    await receiver.page.reload();
    await expect(receiver.page.getByRole("heading", { name: "Scheduled integration message" })).toBeVisible();
    console.log("PASS: scheduled messages stay hidden until due and appear in the browser");

    const capture = join(directory, "email.jsonl");
    const worker = start(["--import", "./scripts/notification-email-fixture.mjs", "--import", "tsx", "scripts/notifications-worker.ts"], { RESEND_API_KEY: "test-only", EMAIL_FROM: "Test <test@notifications.invalid>", NOTIFICATION_EMAIL_CAPTURE: capture });
    await expect.poll(async () => Boolean((await prisma.scheduledJobRun.findUnique({ where: { id: "staff-notifications-heartbeat" } }))?.finishedAt), { timeout: 45_000 }).toBe(true);
    const deliveryState = async (id: string) => (await prisma.staffAlertDelivery.findFirst({ where: { alertId: id } }))?.status;
    const email = await create("Email integration message", { email: true });
    await expect.poll(() => deliveryState(email), { timeout: 45_000 }).toBe("SENT");
    const changedSender = await sender.context.request.put(base + "/api/notifications/email-settings", { data: { senderEmail: "updated@notifications.invalid", senderName: "Updated Company" }, headers: { Origin: base } });
    assert.equal(changedSender.status(), 200);
    const retry = await create("Retry email", { email: true });
    await expect.poll(() => deliveryState(retry), { timeout: 70_000, intervals: [1000] }).toBe("SENT");
    const rejected = await create("Rejected email", { email: true });
    await expect.poll(() => deliveryState(rejected), { timeout: 20_000 }).toBe("FAILED");
    await stop(worker);
    const recovered = await create("Outbox recovery email", { email: true, sendNow: false, scheduledAt: new Date(Date.now() + 2000).toISOString() });
    await delay(2500);
    assert.equal(await deliveryState(recovered), "QUEUED");
    const worker2 = start(["--import", "./scripts/notification-email-fixture.mjs", "--import", "tsx", "scripts/notifications-worker.ts"], { RESEND_API_KEY: "test-only", EMAIL_FROM: "Test <test@notifications.invalid>", NOTIFICATION_EMAIL_CAPTURE: capture });
    await expect.poll(() => deliveryState(recovered), { timeout: 30_000 }).toBe("SENT");
    const captured = readFileSync(capture, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(captured.filter((entry) => entry.subject === "Retry email").length, 2);
    assert.ok(captured.filter((entry) => entry.subject === "Retry email").every((entry) => entry.from.includes("updated@notifications.invalid")));
    console.log("PASS: worker picks up sender changes without a restart; managers cannot change company settings");
    console.log("PASS: real BullMQ worker, email acceptance, retry, terminal failure and restart recovery (provider mocked)");
    await stop(worker2);
    if (process.env.NOTIFICATION_LIVE_EMAIL) {
      assert.ok(process.env.EMAIL_FROM, "Configure the actual company EMAIL_FROM before live testing");
      const companyFrom = process.env.EMAIL_FROM!;
      const liveSenderEmail = companyFrom.match(/<([^>]+)>/)?.[1] || companyFrom;
      const liveSenderName = companyFrom.includes("<") ? companyFrom.split("<")[0].trim().replace(/^"|"$/g, "") : "GadgetHub";
      await prisma.notificationEmailSettings.update({ where: { id: "company" }, data: { senderEmail: liveSenderEmail, senderName: liveSenderName } });
      const liveRecipient = await prisma.user.create({ data: { name: "Live notification recipient", email: process.env.NOTIFICATION_LIVE_EMAIL, passwordHash, role: "CASHIER", branchId: a.id } });
      const response = await post(sender.context, { requestId: randomUUID(), userId: liveRecipient.id, title: "GadgetHub notification delivery test", body: "This is the requested verification email from GadgetHub Messages & Alerts. Email and in-app notification processing are connected.", email: true, sendNow: true });
      assert.equal(response.status(), 201);
      const liveId = (await response.json()).id;
      const liveWorker = start(["--import", "tsx", "scripts/notifications-worker.ts"]);
      await expect.poll(async () => ["SENT", "FAILED"].includes(await deliveryState(liveId) || ""), { timeout: 90_000, intervals: [1000] }).toBe(true);
      const live = await prisma.staffAlertDelivery.findFirst({ where: { alertId: liveId } });
      console.log(live?.status === "SENT" ? "PASS: live Resend email accepted for requested recipient" : `LIVE EMAIL BLOCKED: ${live?.lastError}`);
      await stop(liveWorker);
    }
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) await page.screenshot({ path: join(directory, "failure.png"), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser?.close();
    for (const child of children.reverse()) await stop(child);
    await queue.obliterate({ force: true }); await queue.close();
    // The schema name is generated here, never taken from user input.
    if (/^notifications_e2e_[a-f0-9]{32}$/.test(schema)) await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
    console.log("Isolated notification test data cleaned up. Logs:", directory);
  }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Notification verification failed"); process.exitCode = 1; });
