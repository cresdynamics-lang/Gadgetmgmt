import nodemailer from "nodemailer";

export function emailConfigured() {
  return Boolean((process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && mailFrom()) || (process.env.RESEND_API_KEY && mailFrom()));
}

export function mailFrom() {
  return process.env.MAIL_FROM || process.env.EMAIL_FROM || "";
}

function smtpTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
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

export function customerEmailHtml(input: { heading: string; intro: string; amount?: string; due?: string; payUrl?: string | null; extra?: string }) {
  const pay = input.payUrl
    ? `<p style="margin:24px 0"><a href="${input.payUrl}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Pay this installment</a></p><p style="font-size:12px;color:#667066">Or open this link: <a href="${input.payUrl}">${input.payUrl}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:ui-sans-serif,system-ui,sans-serif;color:#111111">
    <div style="max-width:560px;margin:24px auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;padding:28px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b6b6b">Gadget Hub</p>
      <h1 style="margin:0 0 12px;font-size:22px">${input.heading}</h1>
      <p style="margin:0 0 16px;line-height:1.55;color:#3d3d3d">${input.intro}</p>
      ${input.amount ? `<p style="margin:0 0 8px"><strong>Amount:</strong> ${input.amount}</p>` : ""}
      ${input.due ? `<p style="margin:0 0 8px"><strong>Due:</strong> ${input.due}</p>` : ""}
      ${pay}
      ${input.extra ? `<p style="margin:16px 0 0;font-size:13px;color:#667066">${input.extra}</p>` : ""}
      <p style="margin:24px 0 0;font-size:12px;color:#8a8a8a">Reply to this email or visit the shop if you need help.</p>
    </div>
  </body></html>`;
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const from = mailFrom();
  if (!from) throw new Error("Email delivery needs MAIL_FROM or EMAIL_FROM.");
  const html = input.html ?? customerEmailHtml({
    heading: input.subject,
    intro: input.text,
    payUrl: extractPayLink(input.text),
  });
  const smtp = smtpTransport();
  if (smtp) {
    await smtp.sendMail({
      from,
      to: input.to,
      replyTo: process.env.MAIL_REPLY_TO || undefined,
      subject: input.subject,
      text: input.text,
      html,
    });
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery needs SMTP settings or RESEND_API_KEY.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ from, to: [input.to], reply_to: process.env.MAIL_REPLY_TO || undefined, subject: input.subject, text: input.text, html }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
}
