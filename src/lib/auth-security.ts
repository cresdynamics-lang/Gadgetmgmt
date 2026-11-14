import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEVICE_COOKIE = "gadgethub-device";
export const deviceCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 60 * 60 * 24 * 90 };
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function codeDigest(id: string, code: string) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Authentication secret is required.");
  return createHmac("sha256", secret).update(`${id}:${code}`).digest("hex");
}
export function pinDigest(userId:string,deviceId:string,pin:string) {
  return codeDigest(`device-pin:${userId}:${deviceId}`,pin);
}
export const opaqueToken = () => randomBytes(32).toString("base64url");
export const emailCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
export function ownerEmail() {
  return (process.env.AUTH_OWNER_EMAIL || process.env.INITIAL_OWNER_EMAIL || "").trim().toLowerCase();
}
export function permittedOwner(user: { role: string; email: string }) {
  return user.role !== "OWNER" || (!!ownerEmail() && user.email.toLowerCase() === ownerEmail());
}
export function authOrigin() {
  const value = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (!value) throw new Error("Set APP_BASE_URL for authentication.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Authentication requires HTTPS.");
  return { origin: url.origin, rpID: url.hostname };
}
export function deviceLabel(request: Request) {
  const agent = request.headers.get("user-agent") || "Unknown browser";
  const platform = /iPhone/.test(agent) ? "iPhone" : /iPad/.test(agent) ? "iPad" : /Android/.test(agent) ? "Android" : /Macintosh/.test(agent) ? "Mac" : /Windows/.test(agent) ? "Windows" : "Computer";
  return `${platform} · ${/Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : /Firefox\//.test(agent) ? "Firefox" : "Browser"}`;
}
export async function knownDevice(userId: string, token?: string) {
  if (!token) return null;
  return prisma.authDevice.findFirst({ where: { userId, tokenHash: digest(token), revokedAt: null } });
}
export async function recordFailure(userId: string, label: string, transaction?:Prisma.TransactionClient) {
  const apply=async (tx:Prisma.TransactionClient) => {
    const user = await tx.user.update({ where: { id: userId }, data: { failedSignIns: { increment: 1 } } });
    await tx.authEvent.create({ data: { userId, action: "Sign-in failed", deviceLabel: label } });
    // A conditional update ensures only one alert is created under concurrent failures.
    const locked = await tx.user.updateMany({ where: { id: userId, failedSignIns: { gte: 3 }, lockedAt: null }, data: { lockedAt: new Date() } });
    if (locked.count) {
      await tx.authDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      const owner = await tx.user.findUnique({ where: { email: ownerEmail() || "unconfigured-owner" } });
      if (owner) await tx.staffAlert.create({ data: { userId: owner.id, title: "Account locked after failed sign-ins", body: `${user.name}'s account is locked. Verify their identity before unlocking it in Access.`, deliveries: { create: { channel: "EMAIL" } } } });
    }
  };
  if(transaction)await apply(transaction);else await prisma.$transaction(apply);
}
export async function makeChallenge(userId: string, kind: string, value: string, deviceId?: string, credentialVersion?:number, tx:Prisma.TransactionClient=prisma) {
  await tx.authChallenge.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
  return tx.authChallenge.create({ data: { id: randomUUID(), userId, kind, value, deviceId, credentialVersion, expiresAt: new Date(Date.now() + 5 * 60_000) } });
}
// Atomic deletion consumes challenges once, even when requests race.
export async function consumeChallenge(id: string, kind: string, tx: Prisma.TransactionClient = prisma) {
  const challenge = await tx.authChallenge.findUnique({ where: { id } });
  if (!challenge || challenge.kind !== kind || challenge.expiresAt <= new Date()) return null;
  const consumed = await tx.authChallenge.deleteMany({ where: { id, kind, expiresAt: { gt: new Date() } } });
  return consumed.count ? challenge : null;
}
export async function loginTicket(userId: string, deviceId: string, expectedPinVersion?:number,tx:Prisma.TransactionClient=prisma) {
  const device=await tx.authDevice.findFirst({where:{id:deviceId,userId,revokedAt:null,...(expectedPinVersion===undefined?{}:{pinVersion:expectedPinVersion})},select:{pinVersion:true}});
  if(!device)throw new Error("Device credentials changed. Authenticate again.");
  const ticket = opaqueToken();
  await makeChallenge(userId, "ticket", digest(ticket), deviceId,device.pinVersion,tx);
  return ticket;
}

// A short server lease bounds access when the OS kills a PWA without a visibility beacon.
export function foregroundLeaseUntil(now = Date.now()) {
  const configured = Number(process.env.AUTH_FOREGROUND_LEASE_SECONDS || 120);
  const seconds = Number.isFinite(configured) ? Math.max(60, Math.min(300, configured)) : 120;
  return new Date(now + seconds * 1000);
}
