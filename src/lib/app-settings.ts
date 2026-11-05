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

const OWNER_INBOXES_KEY = "owner_inboxes";
/** Where approval codes, alerts and owner reports go unless Settings says otherwise. */
export const DEFAULT_OWNER_INBOXES = ["gadgethubke64@gmail.com", "gadgethub90@gmail.com"];
/** Copied on owner mail so the shop's own mailbox keeps a record. */
export const OWNER_CC = "info@gadgethubke.com";

function emailList(value: string) {
  return [...new Set(value.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export async function getOwnerInboxes() {
  const stored = emailList(await getSetting(OWNER_INBOXES_KEY) || await getSetting(APPROVAL_EMAIL_KEY)).filter(isEmail);
  return stored.length ? stored : DEFAULT_OWNER_INBOXES;
}

export async function setOwnerInboxes(value: string) {
  const emails = emailList(value);
  const invalid = emails.find((email) => !isEmail(email));
  if (invalid) throw new Error(`${invalid} is not a valid email.`);
  await setSetting(OWNER_INBOXES_KEY, emails.join(", "));
  return getOwnerInboxes();
}

/** Owner mail goes to the owner inboxes; managers keep their own address. The shop mailbox is copied once. */
export function ownerMailRecipients(staff: { email: string; role?: string | null }[], inboxes: string[]) {
  return [...new Set([...staff.filter((user) => user.role !== "OWNER").map((user) => user.email.trim().toLowerCase()), ...inboxes, OWNER_CC])];
}

export async function approvalCodeRecipients() {
  return getOwnerInboxes();
}
