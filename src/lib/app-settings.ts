import { prisma } from "@/lib/prisma";

const APPROVAL_EMAIL_KEY = "approval_code_email";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export async function getSetting(key: string) {
  const row = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  return row?.value?.trim() || "";
}

export async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getApprovalCodeEmail() {
  return (await getSetting(APPROVAL_EMAIL_KEY)) || process.env.APPROVAL_CODE_EMAIL?.trim() || "";
}

export async function setApprovalCodeEmail(email: string) {
  const next = email.trim().toLowerCase();
  if (next && !isEmail(next)) throw new Error("Enter a valid email for approval codes.");
  await setSetting(APPROVAL_EMAIL_KEY, next);
  return next;
}

export async function approvalCodeRecipients() {
  const configured = await getApprovalCodeEmail();
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", status: "ACTIVE" },
    select: { email: true },
  });
  return [...new Set([configured, ...owners.map((owner) => owner.email.trim().toLowerCase())].filter(isEmail))];
}
