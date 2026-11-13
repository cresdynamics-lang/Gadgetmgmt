import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const password = readFileSync(0, "utf8");
if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72 || /[\r\n]/.test(password)) {
  console.error("Owner password must be a single line, at least 12 characters and at most 72 UTF-8 bytes.");
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  const email = process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase();
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", ...(email ? { email } : {}) },
    select: { id: true },
  });
  if (owners.length !== 1) throw new Error("Configure INITIAL_OWNER_EMAIL to select exactly one existing owner.");
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.user.update({
    where: { id: owners[0].id },
    data: { passwordHash, status: "ACTIVE" },
    select: { passwordHash: true },
  });
  if (!(await bcrypt.compare(password, updated.passwordHash))) throw new Error("Owner password verification failed.");
  console.log("Owner password synchronized and verified successfully.");
} catch {
  console.error("Owner password synchronization failed. Check owner selection and database availability.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
