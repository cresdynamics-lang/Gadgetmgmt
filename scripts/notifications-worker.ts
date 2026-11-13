import { emailTransport } from "../src/lib/email-transport";
import { deliverQueuedReceipt } from "../src/lib/receipt-delivery";
import { pushEndpoint } from "../src/lib/push-endpoint";
import { pushTransport } from "../src/lib/push-transport";
import { getCompanyEmailSettings } from "../src/lib/email-settings";
import { Queue, Worker, UnrecoverableError } from "bullmq";
import { prisma } from "../src/lib/prisma";
import * as webpush from "web-push";
import { deliveryJob, notificationConnection, notificationQueueName } from "../src/lib/notification-queue";

const connection = notificationConnection();
const queue = new Queue(notificationQueueName, { connection });

async function sweep() {
  await prisma.customerNotification.updateMany({where:{kind:"SALE_RECEIPT",status:"PROCESSING",updatedAt:{lt:new Date(Date.now()-120000)}},data:{status:"QUEUED"}});
  const receipts=await prisma.customerNotification.findMany({where:{kind:"SALE_RECEIPT",status:"QUEUED",attempts:{lt:5}},select:{id:true},take:100,orderBy:{createdAt:"asc"}});
  for(const receipt of receipts) {
    const jobId=`receipt-${receipt.id}`;
    const previous=await queue.getJob(jobId);
    if(previous && ["completed","failed"].includes(await previous.getState()))await previous.remove();
    await queue.add("receipt",{id:receipt.id},{jobId,attempts:5,backoff:{type:"exponential",delay:30000},removeOnComplete:{age:86400},removeOnFail:{age:604800}});
  }

  const deliveries = await prisma.staffAlertDelivery.findMany({ where: { status: "QUEUED", alert: { scheduledAt: { lte: new Date() } } }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, attempts: true } });
  for (const delivery of deliveries) {
    if (delivery.attempts >= 5) {
      await prisma.staffAlertDelivery.updateMany({ where: { id: delivery.id, status: "QUEUED" }, data: { status: "FAILED", lastError: "Delivery attempt limit reached." } });
      continue;
    }
    const previous = await queue.getJob(delivery.id);
    if (previous && ["failed", "completed"].includes(await previous.getState())) await previous.remove();
    const next = deliveryJob(delivery.id);
    await queue.add(next.name, next.data, next.opts);
  }
  await prisma.scheduledJobRun.upsert({
    where: { id: "staff-notifications-heartbeat" },
    create: { id: "staff-notifications-heartbeat", jobName: "STAFF_NOTIFICATIONS", status: "SUCCEEDED", finishedAt: new Date() },
    update: { status: "SUCCEEDED", finishedAt: new Date() },
  });
}

const worker = new Worker(notificationQueueName, async (job) => {
  if (job.name === "sweep") return sweep();
  if (job.name === "receipt") return deliverQueuedReceipt(job.data.id);
  const delivery = await prisma.staffAlertDelivery.findUnique({ where: { id: job.data.id }, include: { alert: { include: { user: { include: { pushSubscriptions: true } } } } } });
  if (!delivery || delivery.status !== "QUEUED") return;
  const { alert } = delivery;
  if (alert.scheduledAt > new Date()) return;
  if (delivery.attempts >= 5) {
    await prisma.staffAlertDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: "Delivery attempt limit reached." } });
    return;
  }
  if (alert.user.status !== "ACTIVE") {
    await prisma.staffAlertDelivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED" } });
    return;
  }
  await prisma.staffAlertDelivery.update({ where: { id: delivery.id }, data: { attempts: { increment: 1 } } });
  try {
    if (delivery.channel === "EMAIL") {
      const email = await getCompanyEmailSettings();
      if (!email.configured) throw new Error("Configure the company sender in Messages & alerts before sending email.");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${emailTransport("notifications").apiKey}`, "Content-Type": "application/json", "Idempotency-Key": delivery.id },
        body: JSON.stringify({ from: email.from, to: [alert.user.email], subject: alert.title, text: alert.body }),
      });
      if (!response.ok) {
        const hint = response.status === 403 ? " Check the verified sender domain and recipient restrictions." : response.status === 401 ? " Check the Resend API key permissions." : "";
        const message = `Email provider returned ${response.status}.${hint}`;
        if (response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status)) throw new UnrecoverableError(message);
        throw new Error(message);
      }
    } else if (delivery.channel === "PUSH") {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) throw new Error("Browser push is not configured");
      webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
      if (!alert.user.pushSubscriptions.length) {
        await prisma.staffAlertDelivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED", lastError: "No browser subscriptions" } });
        return;
      }
      let delivered = 0;
      for (const subscription of alert.user.pushSubscriptions) {
        try {
          if (!pushEndpoint.safeParse(subscription.endpoint).success) throw new Error("Invalid browser push endpoint");
          // Show generic lock-screen content; full message requires app authentication.
          await pushTransport.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: "GadgetHub alert", body: "You have a new message. Open Messages & alerts to read it.", tag: alert.id }), { timeout: 15_000, TTL: 3600 });
          delivered += 1;
        } catch (error) {
          if (error instanceof webpush.WebPushError && [404, 410].includes(error.statusCode)) await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
          else throw new Error("Browser push delivery failed");
        }
      }
      if (!delivered) {
        await prisma.staffAlertDelivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED", lastError: "All browser subscriptions expired" } });
        return;
      }
    } else throw new Error("Unsupported delivery channel");
    await prisma.staffAlertDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
  } catch (error) {
    await prisma.staffAlertDelivery.update({ where: { id: delivery.id }, data: { status: error instanceof UnrecoverableError || delivery.attempts + 1 >= 5 || job.attemptsMade + 1 >= (job.opts.attempts ?? 1) ? "FAILED" : "QUEUED", lastError: error instanceof Error ? error.message.slice(0, 300) : "Delivery failed" } });
    throw error;
  }
}, { connection, concurrency: 1, limiter: { max: 1, duration: 600 } });
worker.on("error", () => console.error("Notification worker connection error"));
worker.on("failed", (job) => console.error("Notification job failed", job?.id));
queue.on("error", () => console.error("Notification queue connection error"));

async function start() {
  await queue.upsertJobScheduler("notification-outbox", { every: 15_000 }, { name: "sweep", data: {}, opts: { removeOnComplete: 20, removeOnFail: 20 } });
  await sweep();
  console.log("Notification worker ready");
}
async function shutdown() {
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
void start().catch(async () => { console.error("Could not start notification worker"); await shutdown(); process.exitCode = 1; });
