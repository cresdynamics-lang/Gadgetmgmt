import { cookies } from "next/headers";
import { compare } from "bcryptjs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "webauthn-server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications";
import { sameOrigin } from "@/lib/staff-alerts";
import { authOrigin, codeDigest, consumeChallenge, DEVICE_COOKIE, deviceCookieOptions, deviceLabel, digest, emailCode, knownDevice, loginTicket, makeChallenge, opaqueToken, permittedOwner, recordFailure } from "@/lib/auth-security";

const inputSchema = z.object({
  action: z.enum(["password", "code", "passkey-options", "passkey-verify", "register-options", "register-verify"]),
  email: z.string().trim().email().transform(v => v.toLowerCase()).optional(),
  password: z.string().min(1).max(256).optional(),
  challengeId: z.string().uuid().optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
  response: z.unknown().optional(),
});
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const denied = () => reply({ error: "Sign-in could not be verified. Check your details or ask the Administrator to unlock your account." }, 401);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Open this form from GadgetHub." }, 403);
  const raw = await request.text();
  if (raw.length > 24_000) return reply({ error: "Request too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return reply({ error: "Invalid request." }, 400); }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return reply({ error: "Check the required sign-in details." }, 400);
  const input = parsed.data;
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  const label = deviceLabel(request);
  try {
    if (input.action === "password") {
      if (!input.email || !input.password) return denied();
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      // Compare a valid dummy hash for unknown accounts too.
      const valid = await compare(input.password, user?.passwordHash ?? "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW");
      if (!user || user.status !== "ACTIVE" || user.lockedAt || !permittedOwner(user)) return denied();
      if (!valid) { await recordFailure(user.id, label); return denied(); }
      const device = await knownDevice(user.id, token);
      if (device) return reply({ ticket: await loginTicket(user.id, device.id) });
      // Reserve the resend window atomically; do not flood the email provider.
      const reservation = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
        const recent = await tx.authChallenge.findFirst({ where: { userId: user.id, kind: "email", createdAt: { gt: new Date(Date.now() - 60_000) } } });
        if (recent) return null;
        const id = randomUUID();
        const code = emailCode();
        await tx.authChallenge.deleteMany({ where: { userId: user.id, kind: "email" } });
        await tx.authChallenge.create({ data: { id, userId: user.id, kind: "email", value: codeDigest(id, code), expiresAt: new Date(Date.now() + 5 * 60_000) } });
        return { id, code };
      });
      if (!reservation) return reply({ error: "A code was sent recently. Wait one minute before requesting another." }, 429);
      try {
        await deliverNotification({ channel: "EMAIL", recipient: user.email, subject: "Your GadgetHub sign-in code", body: `Your sign-in code is ${reservation.code}. It expires in five minutes. If you did not request it, contact the Administrator. Never share this code.` });
      } catch {
        await prisma.authChallenge.deleteMany({ where: { id: reservation.id } });
        return reply({ error: "The code could not be delivered. Try again shortly or contact the Administrator." }, 503);
      }
      return reply({ challengeId: reservation.id, needsCode: true });
    }
    if (input.action === "code") {
      if (!input.challengeId || !input.code) return denied();
      const challenge = await prisma.authChallenge.findUnique({ where: { id: input.challengeId }, include: { user: true } });
      if (!challenge || challenge.kind !== "email" || challenge.expiresAt <= new Date() || challenge.user.status !== "ACTIVE" || challenge.user.lockedAt || !permittedOwner(challenge.user)) return denied();
      if (!timingSafeEqual(Buffer.from(challenge.value), Buffer.from(codeDigest(challenge.id, input.code)))) {
        await recordFailure(challenge.userId, label); return denied();
      }
      if (!await consumeChallenge(challenge.id, "email")) return denied();
      const deviceToken = opaqueToken();
      const device = await prisma.authDevice.create({ data: { userId: challenge.userId, tokenHash: digest(deviceToken), label } });
      jar.set(DEVICE_COOKIE, deviceToken, deviceCookieOptions);
      return reply({ ticket: await loginTicket(challenge.userId, device.id) });
    }
    if (input.action === "passkey-options") {
      if (!input.email) return denied();
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      if (!user || user.status !== "ACTIVE" || user.lockedAt || !permittedOwner(user) || (user.role !== "OWNER" && !user.biometricsAllowed)) return denied();
      const device = await knownDevice(user.id, token);
      if (!device) return reply({ error: "Use your password and email code to verify this device first." }, 401);
      const keys = await prisma.authPasskey.findMany({ where: { deviceId: device.id } });
      if (!keys.length) return reply({ error: "Sign in with your password, then set up Face ID or a passkey in Account security." }, 400);
      const { rpID } = authOrigin();
      const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: keys.map(key => ({ id: key.id, transports: key.transports })) });
      const challenge = await makeChallenge(user.id, "authenticate", options.challenge, device.id);
      return reply({ options, challengeId: challenge.id });
    }
    if (input.action === "passkey-verify") {
      if (!input.challengeId || !input.response) return denied();
      const challenge = await consumeChallenge(input.challengeId, "authenticate");
      if (!challenge?.deviceId) return denied();
      const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
      const device = await knownDevice(challenge.userId, token);
      if (!user || user.status !== "ACTIVE" || user.lockedAt || !permittedOwner(user) || (user.role !== "OWNER" && !user.biometricsAllowed) || device?.id !== challenge.deviceId) return denied();
      const response = input.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"];
      const key = await prisma.authPasskey.findFirst({ where: { id: response.id, deviceId: device.id } });
      if (!key) { await recordFailure(user.id, label); return denied(); }
      try {
        const { origin, rpID } = authOrigin();
        const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.value, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, credential: { id: key.id, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: key.transports } });
        if (!result.verified) throw new Error("Not verified");
        await prisma.authPasskey.update({ where: { id: key.id }, data: { counter: result.authenticationInfo.newCounter } });
      } catch { await recordFailure(user.id, label); return denied(); }
      return reply({ ticket: await loginTicket(user.id, device.id) });
    }
    const session = await auth();
    if (!session?.user) return denied();
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const device = await knownDevice(session.user.id, token);
    if (!user || !device || (user.role !== "OWNER" && !user.biometricsAllowed)) return reply({ error: "Administrator must allow biometrics for this account first." }, 403);
    // Enrollment requires a recent password verification, even on an open session.
    if (input.action === "register-options") {
      if (!input.password || !await compare(input.password, user.passwordHash)) { await recordFailure(user.id, label); return denied(); }
      const { rpID } = authOrigin();
      const existing = await prisma.authPasskey.findMany({ where: { deviceId: device.id } });
      const options = await generateRegistrationOptions({ rpID, rpName: "GadgetHub", userName: user.email, userID: new TextEncoder().encode(user.id), attestationType: "none", authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" }, excludeCredentials: existing.map(key => ({ id: key.id, transports: key.transports })) });
      const challenge = await makeChallenge(user.id, "register", options.challenge, device.id);
      return reply({ options, challengeId: challenge.id });
    }
    if (!input.challengeId || !input.response) return denied();
    const challenge = await consumeChallenge(input.challengeId, "register");
    if (!challenge || challenge.userId !== user.id || challenge.deviceId !== device.id) return denied();
    const { origin, rpID } = authOrigin();
    const result = await verifyRegistrationResponse({ response: input.response as Parameters<typeof verifyRegistrationResponse>[0]["response"], expectedChallenge: challenge.value, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    if (!result.verified || !result.registrationInfo) return denied();
    const credential = result.registrationInfo.credential;
    await prisma.authPasskey.create({ data: { id: credential.id, deviceId: device.id, publicKey: Buffer.from(credential.publicKey), counter: credential.counter, transports: credential.transports ?? [] } });
    await prisma.authEvent.create({ data: { userId: user.id, action: "Passkey registered", deviceLabel: label } });
    return reply({ ok: true });
  } catch {
    console.error("Authentication operation failed.");
    return reply({ error: "Sign-in is unavailable. Try again shortly." }, 503);
  }
}
