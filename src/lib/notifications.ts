import type { NotificationChannel } from "@prisma/client";

import { emailConfigured, extractPayLink, sendEmail } from "@/lib/mail";

export { emailConfigured };

export async function deliverNotification(input: { channel: NotificationChannel; recipient: string; subject: string | null; body: string }) {
  if (input.channel === "EMAIL") {
    await sendEmail({
      to: input.recipient,
      subject: input.subject ?? "Gadget Hub update",
      text: input.body,
    });
    return;
  }

  if (input.channel === "WHATSAPP") {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_PAYMENT_TEMPLATE;
    if (!accessToken || !phoneNumberId || !templateName) throw new Error("WhatsApp delivery needs WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_PAYMENT_TEMPLATE.");
    const token = extractPayLink(input.body)?.split("/").pop();
    const buttonIndex = process.env.WHATSAPP_PAY_BUTTON_INDEX || "0";
    const bodyText = input.body.replace(/\s*Pay securely here: https?:\/\/\S+/i, "").slice(0, 1024);
    const response = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.recipient.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
          components: [
            { type: "body", parameters: [{ type: "text", text: bodyText }] },
            ...(token ? [{ type: "button", sub_type: "url", index: buttonIndex, parameters: [{ type: "text", text: token }] }] : []),
          ],
        },
      }),
    });
    if (!response.ok) throw new Error(`WhatsApp provider returned ${response.status}.`);
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
