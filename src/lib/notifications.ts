import type { NotificationChannel } from "@prisma/client";

export async function deliverNotification(input: { channel: NotificationChannel; recipient: string; subject: string | null; body: string }) {
  if (input.channel === "EMAIL") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) throw new Error("Email delivery needs RESEND_API_KEY and EMAIL_FROM.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ from, to: [input.recipient], subject: input.subject ?? "GadgetHub update", text: input.body }),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
    return;
  }

  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if (!username || !apiKey) throw new Error("SMS delivery needs AT_USERNAME and AT_API_KEY.");
  const phone = input.recipient.startsWith("+") ? input.recipient : `+${input.recipient.replace(/\D/g, "")}`;
  const form = new URLSearchParams({ username, to: phone, message: input.body });
  if (process.env.AT_SENDER_ID) form.set("from", process.env.AT_SENDER_ID);
  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SMS provider returned ${response.status}.`);
  const result = await response.json() as { SMSMessageData?: { Recipients?: { statusCode?: number; status?: string }[] } };
  const recipients = result.SMSMessageData?.Recipients ?? [];
  if (!recipients.length || recipients.some((recipientResult) => recipientResult.statusCode !== 101)) {
    throw new Error(recipients[0]?.status ?? "SMS provider did not accept the message.");
  }
}
