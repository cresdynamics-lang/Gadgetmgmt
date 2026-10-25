import nodemailer from "nodemailer";

/**
 * Each kind of email goes out through its own Resend key and sender address, so delivery
 * and reputation for receipts, account mail and reminders stay separate.
 * Anything without its own category uses the notifications key.
 */
export type MailCategory = "notifications" | "orders" | "accounts";

const categoryEnv: Record<MailCategory, string> = { notifications: "NOTIFICATIONS", orders: "ORDERS", accounts: "ACCOUNTS" };

/** Notification kinds that are about a customer's purchase rather than a reminder or alert. */
const orderKinds = new Set(["SALE_PAYMENT_LINK", "SALE_PAYMENT_LINKS", "SALE_RECEIPT", "PAYMENT_RECEIVED"]);
const accountKinds = new Set(["STAFF_WELCOME", "APPROVAL_CODE"]);

export function mailCategoryForKind(kind?: string | null): MailCategory {
  if (kind && orderKinds.has(kind)) return "orders";
  if (kind && accountKinds.has(kind)) return "accounts";
  return "notifications";
}

function resendKey(category: MailCategory) {
  return process.env[`RESEND_API_KEY_${categoryEnv[category]}`] || process.env.RESEND_API_KEY_NOTIFICATIONS || process.env.RESEND_API_KEY || "";
}

export function mailFrom(category: MailCategory = "notifications") {
  return process.env[`MAIL_FROM_${categoryEnv[category]}`] || process.env.MAIL_FROM || process.env.EMAIL_FROM || "";
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function emailConfigured(category: MailCategory = "notifications") {
  return Boolean(mailFrom(category) && (resendKey(category) || smtpConfigured()));
}

function smtpTransport() {
  if (!smtpConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export function extractPayLink(text: string) {
  return text.match(/https?:\/\/\S+\/(?:request|pay)\/[A-Za-z0-9_-]+/)?.[0] ?? null;
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function customerEmailHtml(input: { heading: string; intro: string; amount?: string; due?: string; payUrl?: string | null; extra?: string }) {
  const payUrl = input.payUrl ? escapeHtml(input.payUrl) : null;
  const pay = payUrl
    ? `<p style="margin:24px 0"><a href="${payUrl}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Pay now</a></p><p style="font-size:12px;color:#667066">Or open this link: <a href="${payUrl}">${payUrl}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:ui-sans-serif,system-ui,sans-serif;color:#111111">
    <div style="max-width:560px;margin:24px auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;padding:28px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b6b6b">Gadget Hub · Norwich Union Hse</p>
      <h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(input.heading)}</h1>
      <p style="margin:0 0 16px;line-height:1.55;color:#3d3d3d">${escapeHtml(input.intro).replace(/\n/g, "<br>")}</p>
      ${input.amount ? `<p style="margin:0 0 8px"><strong>Amount:</strong> ${escapeHtml(input.amount)}</p>` : ""}
      ${input.due ? `<p style="margin:0 0 8px"><strong>Due:</strong> ${escapeHtml(input.due)}</p>` : ""}
      ${pay}
      ${input.extra ? `<p style="margin:16px 0 0;font-size:13px;color:#667066">${escapeHtml(input.extra)}</p>` : ""}
      <p style="margin:24px 0 0;font-size:12px;color:#8a8a8a">Reply to this email or visit the shop if you need help.</p>
    </div>
  </body></html>`;
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string; category?: MailCategory }) {
  const category = input.category ?? "notifications";
  const from = mailFrom(category);
  if (!from) throw new Error(`Email delivery needs MAIL_FROM_${categoryEnv[category]} or MAIL_FROM.`);
  const html = input.html ?? customerEmailHtml({
    heading: input.subject,
    intro: input.text,
    payUrl: extractPayLink(input.text),
  });
  const replyTo = process.env.MAIL_REPLY_TO || undefined;

  // Resend is preferred; SMTP stays as a fallback when no Resend key is set.
  const apiKey = resendKey(category);
  if (apiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ from, to: [input.to], reply_to: replyTo, subject: input.subject, text: input.text, html }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(`Email provider returned ${response.status}${detail?.message ? `: ${detail.message}` : ""}.`);
    }
    return;
  }
  const smtp = smtpTransport();
  if (!smtp) throw new Error("Email delivery needs a Resend API key or SMTP settings.");
  await smtp.sendMail({ from, to: input.to, replyTo, subject: input.subject, text: input.text, html });
}
