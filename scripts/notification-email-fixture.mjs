import { pushTransport } from "../src/lib/push-transport.ts";
// Loaded only by the isolated end-to-end test worker. Never used in production.
import { appendFileSync } from "node:fs";
const nativeFetch = globalThis.fetch;
const attempts = new Map();
globalThis.fetch = async (url, options) => {
  if (String(url) !== "https://api.resend.com/emails") return nativeFetch(url, options);
  const payload = JSON.parse(options.body);
  const key = options.headers["Idempotency-Key"];
  const attempt = (attempts.get(key) || 0) + 1;
  attempts.set(key, attempt);
  appendFileSync(process.env.NOTIFICATION_EMAIL_CAPTURE, JSON.stringify({ key, subject: payload.subject, from: payload.from, to: payload.to, attempt }) + "\n");
  if (payload.subject === "Retry email" && attempt === 1) return Response.json({ name: "rate_limit_exceeded" }, { status: 429 });
  if (payload.subject === "Rejected email") return Response.json({ name: "validation_error" }, { status: 403 });
  return Response.json({ id: `fixture-${key}` });
};

pushTransport.sendNotification = async (subscription, payload) => {
  appendFileSync(process.env.NOTIFICATION_EMAIL_CAPTURE, JSON.stringify({ kind: "push", endpoint: subscription.endpoint, payload: JSON.parse(payload) }) + "\n");
  return { statusCode: 201, body: "", headers: {} };
};
