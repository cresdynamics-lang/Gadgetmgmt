import { emailTransport, type EmailPurpose } from "./email-transport";
import { prisma } from "./prisma";

export async function getCompanyEmailSettings(purpose:EmailPurpose="notifications") {
  const saved = await prisma.notificationEmailSettings.findUnique({ where: { id: "company" } });
  const transport=emailTransport(purpose);
  const environmentFrom = transport.from;
  const environmentAddress = environmentFrom.match(/<([^>]+)>/)?.[1] || environmentFrom;
  const environmentName = environmentFrom.includes("<") ? environmentFrom.split("<")[0].trim().replace(/^"|"$/g, "") : "GadgetHub";
  const senderEmail = saved?.senderEmail || environmentAddress;
  const senderName = saved?.senderName || environmentName;
  // A sender set for one purpose (e.g. MAIL_FROM_ORDERS for receipts from info@gadgethubke.com) wins over the shared company sender.
  const purposeFrom = process.env[`MAIL_FROM_${purpose.toUpperCase()}`]?.trim();
  const from = purposeFrom || (saved ? `${JSON.stringify(saved.senderName)} <${saved.senderEmail}>` : environmentFrom);
  const apiKeyConfigured = Boolean(transport.apiKey);
  return { from, senderEmail, senderName, apiKeyConfigured, configured: Boolean(apiKeyConfigured && from), testMode: senderEmail.toLowerCase().endsWith("@resend.dev") };
}
