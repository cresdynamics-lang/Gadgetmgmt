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
  if (owners.length !== 1) {
    console.error(`Owner selection matched ${owners.length} accounts; INITIAL_OWNER_EMAIL configured: ${Boolean(email)}.`);
    throw new Error("Owner selection failed");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.user.update({
    where: { id: owners[0].id },
    data: { passwordHash, status: "ACTIVE" },
    select: { passwordHash: true },
  });
  if (!(await bcrypt.compare(password, updated.passwordHash))) throw new Error("Owner password verification failed.");
  console.log("Owner password synchronized and verified successfully.");
} catch (error) {
  const code = error.code ?? error.errorCode;
  if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) console.error(`Database error code: ${code}`);
  console.error(`Failure type: ${error.name}`);
  let detail = String(error.message);
  for (const value of [process.env.DATABASE_URL, password]) {
    if (value) detail = detail.replaceAll(value, "[redacted]");
  }
  detail = detail.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]");
  console.error(detail);
  console.error("Owner password synchronization failed. Check owner selection and database availability.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
