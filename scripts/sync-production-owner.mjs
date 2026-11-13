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
  const name = process.env.INITIAL_OWNER_NAME?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Configure a valid INITIAL_OWNER_EMAIL");
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.$transaction(async (tx) => {
    const owners = await tx.user.findMany({ where: { role: "OWNER" }, select: { id: true, email: true } });
    const owner = owners.find((candidate) => candidate.email.toLowerCase() === email)
      ?? (owners.length === 1 ? owners[0] : null);
    if (!owner) throw new Error("Owner account selection is ambiguous or missing");
    const conflicting = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (conflicting && conflicting.id !== owner.id) throw new Error("Configured owner email belongs to another account");
    return tx.user.update({
      where: { id: owner.id },
      data: { email, ...(name ? { name } : {}), passwordHash, status: "ACTIVE" },
      select: { email: true, passwordHash: true, status: true, role: true },
    });
  });
  if (updated.email !== email || updated.status !== "ACTIVE" || updated.role !== "OWNER" || !(await bcrypt.compare(password, updated.passwordHash))) {
    throw new Error("Owner account verification failed");
  }
  console.log("Owner email, active status and password synchronized and verified successfully.");
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
