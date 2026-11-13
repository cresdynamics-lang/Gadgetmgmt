import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
try {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run auth:unlock -- account@example.com. Verify the account holder’s identity first.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Account not found.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lockedAt: null, failedSignIns: 0 } }),
    prisma.authEvent.create({ data: { userId: user.id, action: "Account unlocked by server operator", deviceLabel: "Server recovery command" } }),
  ]);
  console.log("Account unlocked. Devices remain revoked; password and email verification are required.");
} finally { await prisma.$disconnect(); }

}
main().catch(error => { console.error(error instanceof Error ? error.message : "Recovery failed."); process.exitCode = 1; });
