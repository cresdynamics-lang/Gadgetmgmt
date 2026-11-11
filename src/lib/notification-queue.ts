import { Queue, type JobsOptions } from "bullmq";

export const notificationQueueName = process.env.NOTIFICATION_QUEUE_NAME || "staff-notifications";
export function notificationConnection() {
  const url = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username ? decodeURIComponent(url.username) : undefined, password: url.password ? decodeURIComponent(url.password) : undefined, db: Number(url.pathname.slice(1) || 0), ...(url.protocol === "rediss:" ? { tls: {} } : {}) };
}
export function deliveryJob(id: string): { name: string; data: { id: string }; opts: JobsOptions } {
  return { name: "deliver", data: { id }, opts: { jobId: id, attempts: 5, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: { age: 86400 }, removeOnFail: { age: 7 * 86400 } } };
}

export async function enqueueImmediateDeliveries(ids: string[]) {
  if (!ids.length) return;
  const queue = new Queue(notificationQueueName, { connection: { ...notificationConnection(), connectTimeout: 2000, maxRetriesPerRequest: 1, retryStrategy: () => null } });
  queue.on("error", () => { /* Caller reports outbox fallback without leaking Redis configuration. */ });
  try {
    await queue.addBulk(ids.map(deliveryJob));
  } finally {
    await queue.close();
  }
}
