import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import * as webpush from "web-push";
import { prisma } from "../src/lib/prisma";

async function main() {
  let content = readFileSync(".env", "utf8");
  const env = { ...parseEnv(content), ...process.env };
  let publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  let privateKey = env.VAPID_PRIVATE_KEY;
  if (Boolean(publicKey) !== Boolean(privateKey)) throw new Error("Push keys are partially configured. Restore the matching pair before continuing; existing subscriptions depend on it.");
  if (!publicKey && !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey; privateKey = keys.privateKey;
  }
  let subject = env.VAPID_SUBJECT;
  if (!subject) {
    const owner = await prisma.user.findFirst({ where: { role: "OWNER", status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { email: true } });
    if (!owner) throw new Error("Set VAPID_SUBJECT to your administrator's mailto address or HTTPS contact URL.");
    subject = `mailto:${owner.email}`;
  }
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
  for (const [name, value] of Object.entries({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey!, VAPID_PRIVATE_KEY: privateKey!, VAPID_SUBJECT: subject })) {
    const expression = new RegExp(`^${name}=.*$`, "gm");
    const line = `${name}=${JSON.stringify(value)}`;
    content = expression.test(content) ? content.replace(expression, () => line) : `${content.trimEnd()}\n${line}\n`;
  }
  writeFileSync(".env", content);
  console.log("Browser push is configured in local .env. Existing key pairs were preserved. Restart the web app and delivery worker to load initial setup.");
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Could not configure push"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
