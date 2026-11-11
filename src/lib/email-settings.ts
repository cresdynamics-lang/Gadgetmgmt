import { prisma } from "./prisma";

export async function getCompanyEmailSettings() {
  const saved = await prisma.notificationEmailSettings.findUnique({ where: { id: "company" } });
  const environmentFrom = process.env.EMAIL_FROM?.trim() || "";
  const environmentAddress = environmentFrom.match(/<([^>]+)>/)?.[1] || environmentFrom;
  const environmentName = environmentFrom.includes("<") ? environmentFrom.split("<")[0].trim().replace(/^"|"$/g, "") : "GadgetHub";
  const senderEmail = saved?.senderEmail || environmentAddress;
  const senderName = saved?.senderName || environmentName;
  const from = saved ? `${JSON.stringify(saved.senderName)} <${saved.senderEmail}>` : environmentFrom;
  const apiKeyConfigured = Boolean(process.env.RESEND_API_KEY);
  return { from, senderEmail, senderName, apiKeyConfigured, configured: Boolean(apiKeyConfigured && from), testMode: senderEmail.toLowerCase().endsWith("@resend.dev") };
}
