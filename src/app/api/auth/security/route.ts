import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "webauthn-server";
import { auth } from "@/auth";
import { signInAllowed } from "@/lib/sign-in-methods";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications";
import { sameOrigin } from "@/lib/staff-alerts";
import { authOrigin, codeDigest, consumeChallenge, DEVICE_COOKIE, deviceCookieOptions, deviceLabel, digest, emailCode, knownDevice, loginTicket, makeChallenge, opaqueToken, permittedOwner, pinDigest, recordFailure } from "@/lib/auth-security";

const inputSchema = z.object({
  action: z.enum(["password", "code", "passkey-options", "passkey-verify", "register-options", "register-verify", "device-state", "pin", "pin-set"]),
  email: z.string().trim().email().transform(v => v.toLowerCase()).optional(),
  password: z.string().min(1).max(256).optional(),
  challengeId: z.string().uuid().optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
  response: z.unknown().optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
  confirmPin: z.string().regex(/^\d{6}$/).optional(),
});
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const denied = () => reply({ error: "Sign-in could not be verified. Check your details or contact the Administrator to review your sign-in access." }, 401);

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
    if(input.action==="device-state"){
      const device=token?await prisma.authDevice.findUnique({where:{tokenHash:digest(token)},include:{user:true}}):null;
      if(!device||device.revokedAt||device.user.status!=="ACTIVE"||device.user.lockedAt||!permittedOwner(device.user))return reply({known:false});
      return reply({known:true,email:device.user.email,pinConfigured:Boolean(device.pinHash)&&signInAllowed(device.user,device,"PIN"),methods:{pin:signInAllowed(device.user,device,"PIN"),password:signInAllowed(device.user,device,"PASSWORD"),biometric:signInAllowed(device.user,device,"BIOMETRIC")}});
    }
    if(input.action==="pin"){
      if(!input.email||!input.pin||!token)return denied();
      const email=input.email,pin=input.pin,deviceHash=digest(token);
      const ticket=await prisma.$transaction(async tx=>{
        // Serialize attempts so concurrent requests cannot exceed the failure budget.
        await tx.$queryRaw`SELECT id FROM "User" WHERE email=${email} FOR UPDATE`;
        const user=await tx.user.findUnique({where:{email}});
        if(!user||user.status!=="ACTIVE"||user.lockedAt||!permittedOwner(user))return null;
        const device=await tx.authDevice.findFirst({where:{userId:user.id,tokenHash:deviceHash,revokedAt:null}});
        if(!device?.pinHash||!signInAllowed(user,device,"PIN"))return null;
        if(!await compare(pinDigest(user.id,device.id,pin),device.pinHash)){await recordFailure(user.id,label,tx);return null;}
        return loginTicket(user.id,device.id,device.pinVersion,tx,"PIN");
      },{timeout:10000});
      return ticket?reply({ticket}):denied();
    }
    if (input.action === "password") {
      if (!input.email || !input.password) return denied();
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      // Compare a valid dummy hash for unknown accounts too.
      const valid = await compare(input.password, user?.passwordHash ?? "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW");
      if (!user || user.status !== "ACTIVE" || user.lockedAt || !permittedOwner(user)) return denied();
      if (!valid) { await recordFailure(user.id, label); return denied(); }
      const device = await knownDevice(user.id, token);
      // Password is an ownership/recovery path and always requires the emailed code.
      // Reserve the resend window atomically; do not flood the email provider.
      const reservation = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
        const current=await tx.user.findUnique({where:{id:user.id}});
        if(!current||current.passwordHash!==user.passwordHash||current.lockedAt||current.status!=="ACTIVE"||!permittedOwner(current))return {denied:true as const};
        const policyDevice=device??{pinAllowed:true,passwordAllowed:true,biometricsAllowed:true};
        if(!signInAllowed(current,policyDevice,"PASSWORD")&&!signInAllowed(current,policyDevice,"PIN"))return {denied:true as const};
        const recent = await tx.authChallenge.findFirst({ where: { userId: user.id, kind: "email", createdAt: { gt: new Date(Date.now() - 60_000) } } });
        if (recent) return null;
        const id = randomUUID();
        const code = emailCode();
        await tx.authChallenge.deleteMany({ where: { userId: user.id, kind: "email" } });
        await tx.authChallenge.create({ data: { id, userId: user.id, kind: "email", deviceId:device?.id, value: codeDigest(id, code), expiresAt: new Date(Date.now() + 5 * 60_000) } });
        return { id, code };
      });
      if(reservation&&"denied" in reservation)return denied();
      if (!reservation) return reply({ error: "A code was sent recently. Wait one minute before requesting another." }, 429);
      try {
        await deliverNotification({ purpose: "accounts", channel: "EMAIL", recipient: user.email, subject: "Your GadgetHub sign-in code", body: `Your sign-in code is ${reservation.code}. It expires in five minutes. If you did not request it, contact the Administrator. Never share this code.` });
      } catch {
        await prisma.authChallenge.deleteMany({ where: { id: reservation.id } });
        return reply({ error: "The code could not be delivered. Try again shortly or contact the Administrator." }, 503);
      }
      return reply({ challengeId: reservation.id, needsCode: true });
    }
    if (input.action === "code") {
      if (!input.challengeId || !input.code) return denied();
      const challengeId=input.challengeId,code=input.code;
      const pending=await prisma.authChallenge.findUnique({where:{id:challengeId}});if(!pending)return denied();
      const verified=await prisma.$transaction(async tx=>{
        // Serialize ownership verification with password reset and credential changes.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${pending.userId} FOR UPDATE`;
        const challenge=await tx.authChallenge.findUnique({where:{id:challengeId},include:{user:true}});
        if(!challenge||challenge.kind!=="email"||challenge.expiresAt<=new Date()||challenge.user.status!=="ACTIVE"||challenge.user.lockedAt||!permittedOwner(challenge.user))return null;
        if(!timingSafeEqual(Buffer.from(challenge.value),Buffer.from(codeDigest(challenge.id,code)))){await recordFailure(challenge.userId,label,tx);return null;}
        const previous=await knownDevice(challenge.userId,token,tx);
        if(challenge.deviceId&&previous?.id!==challenge.deviceId)return null;
        const policyDevice=previous??{pinAllowed:true,passwordAllowed:true,biometricsAllowed:true};
        const pinAllowed=signInAllowed(challenge.user,policyDevice,"PIN"),passwordAllowed=signInAllowed(challenge.user,policyDevice,"PASSWORD");
        if(!pinAllowed&&!passwordAllowed||!await consumeChallenge(challenge.id,"email",tx))return null;
        const deviceToken=previous?token!:opaqueToken();
        const device=previous??await tx.authDevice.create({data:{userId:challenge.userId,tokenHash:digest(deviceToken),label}});
        const setup=pinAllowed?await makeChallenge(challenge.userId,"pin-setup",digest(deviceToken),device.id,undefined,tx):null;
        const ticket=passwordAllowed?await loginTicket(challenge.userId,device.id,undefined,tx,"PASSWORD"):undefined;
        return {deviceToken,ticket,pinSetupId:setup?.id};
      });
      if(!verified)return denied();
      jar.set(DEVICE_COOKIE,verified.deviceToken,deviceCookieOptions);
      return reply({ticket:verified.ticket,pinSetupId:verified.pinSetupId});
    }
    if(input.action==="pin-set"){
      if(!input.challengeId||!input.pin||input.pin!==input.confirmPin)return reply({error:"Enter and confirm the same six-digit PIN after verifying ownership."},400);
      const setupId=input.challengeId;
      const proof=await prisma.authChallenge.findUnique({where:{id:setupId}});
      if(!proof)return denied();
      const verifiedUserId=proof.userId;
      const device=await knownDevice(verifiedUserId,token);if(!device)return denied();
      if(!proof||proof.kind!=="pin-setup"||proof.userId!==verifiedUserId||proof.deviceId!==device.id||proof.value!==digest(token??"")||proof.expiresAt<=new Date())return reply({error:"Ownership verification expired. Verify your email and password again."},401);
      const pinHash=await hash(pinDigest(verifiedUserId,device.id,input.pin),12);
      const updated=await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${verifiedUserId} FOR UPDATE`;
        const currentUser=await tx.user.findUnique({where:{id:verifiedUserId}});
        if(!currentUser||currentUser.status!=="ACTIVE"||currentUser.lockedAt||!permittedOwner(currentUser)||!signInAllowed(currentUser,device,"PIN"))return null;
        const setup=await tx.authChallenge.findUnique({where:{id:setupId}});
        if(!setup||setup.kind!=="pin-setup"||setup.userId!==verifiedUserId||setup.deviceId!==device.id||setup.value!==digest(token??""))return null;
        if(!await consumeChallenge(setupId,"pin-setup",tx))return null;
        const result=await tx.authDevice.updateMany({where:{id:device.id,userId:verifiedUserId,revokedAt:null,pinVersion:device.pinVersion},data:{pinHash,pinVersion:{increment:1},pinUpdatedAt:new Date()}});
        if(!result.count)throw new Error("PIN changed concurrently");
        await tx.authChallenge.deleteMany({where:{deviceId:device.id,kind:{in:["ticket","pin-setup","register","authenticate"]}}});
        await tx.authEvent.create({data:{userId:verifiedUserId,action:device.pinHash?"Device PIN changed":"Device PIN created",deviceLabel:label}});
        return device.pinVersion+1;
      });
      if(updated===null)return reply({error:"Ownership verification expired. Verify your email and password again."},401);
      return reply({ticket:await loginTicket(verifiedUserId,device.id,updated,prisma,"PIN")});
    }
    if (input.action === "passkey-options") {
      if (!input.email) return denied();
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      if (!user || user.status !== "ACTIVE" || user.lockedAt || !permittedOwner(user) || (user.role !== "OWNER" && !user.biometricsAllowed)) return denied();
      const device = await knownDevice(user.id, token);
      if (!device||!signInAllowed(user,device,"BIOMETRIC")) return reply({ error: "Biometrics are unavailable on this device. Use an allowed sign-in method or contact the Administrator." }, 401);
      const keys = await prisma.authPasskey.findMany({ where: { deviceId: device.id } });
      if (!keys.length) return reply({ error: "Use an allowed sign-in method, then set up Face ID or a passkey in Settings → Account security." }, 400);
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
      if (!user || user.status !== "ACTIVE" || user.lockedAt || !permittedOwner(user) || (user.role !== "OWNER" && !user.biometricsAllowed) || device?.id !== challenge.deviceId || !signInAllowed(user,device,"BIOMETRIC")) return denied();
      const response = input.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"];
      const key = await prisma.authPasskey.findFirst({ where: { id: response.id, deviceId: device.id } });
      if (!key) { await recordFailure(user.id, label); return denied(); }
      try {
        const { origin, rpID } = authOrigin();
        const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.value, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, credential: { id: key.id, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: key.transports } });
        if (!result.verified) throw new Error("Not verified");
        await prisma.authPasskey.update({ where: { id: key.id }, data: { counter: result.authenticationInfo.newCounter } });
      } catch { await recordFailure(user.id, label); return denied(); }
      return reply({ ticket: await loginTicket(user.id, device.id,undefined,prisma,"BIOMETRIC") });
    }
    const session = await auth();
    if (!session?.user) return denied();
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const device = await knownDevice(session.user.id, token);
    if (!user || !device || !signInAllowed(user,device,"BIOMETRIC")) return reply({ error: "The Administrator must allow biometrics for this account and device first." }, 403);
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
