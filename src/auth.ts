import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { consumeChallenge, DEVICE_COOKIE, digest, permittedOwner } from "@/lib/auth-security";
import { z } from "zod";

import { readStoredGrant } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

if (process.env.NODE_ENV === "production") {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 43 || secret === "replace-with-a-long-random-secret") {
    throw new Error("Set NEXTAUTH_SECRET to a cryptographically generated 32-byte base64 value in production.");
  }
}

const credentialsSchema = z.object({ ticket: z.string().min(32).max(128) });

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { ticket: { type: "password" } },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const ticket = await prisma.authChallenge.findFirst({ where: { kind: "ticket", value: digest(parsed.data.ticket), expiresAt: { gt: new Date() } } });
        if (!ticket?.deviceId || !await consumeChallenge(ticket.id, "ticket")) return null;
        const token = (await cookies()).get(DEVICE_COOKIE)?.value;
        const device = await prisma.authDevice.findFirst({ where: { id: ticket.deviceId, userId: ticket.userId, tokenHash: digest(token ?? ""), revokedAt: null } });
        if (!device) return null;
        const user = await prisma.user.findUnique({ where: { id: ticket.userId }, include: { branch: { select: { name: true } } } });
        if (!user || user.status !== "ACTIVE" || user.lockedAt || !permittedOwner(user)) return null;
        await prisma.$transaction([
          prisma.user.update({ where: { id: user.id }, data: { failedSignIns: 0 } }),
          prisma.authDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date(), lockedAt: null } }),
          prisma.authEvent.create({ data: { userId: user.id, action: "Signed in", deviceLabel: device.label } }),
        ]);

        return {
          id: user.id,
          deviceId: device.id,
          name: user.name,
          email: user.email,
          role: user.role,
          branchId: user.branchId,
          branchName: user.branch?.name ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.deviceId = user.deviceId;
        token.role = user.role;
        token.branchId = user.branchId;
        token.branchName = user.branchName;
      } else if (typeof token.userId === "string" && token.userId) {
        const currentUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { email: true, lockedAt: true, role: true, status: true, branchId: true, branch: { select: { name: true } } },
        });
        if (!currentUser || currentUser.status !== "ACTIVE" || currentUser.lockedAt || !permittedOwner(currentUser)) return null;
        const device = typeof token.deviceId === "string" ? await prisma.authDevice.findFirst({ where: { id: token.deviceId, userId: token.userId, revokedAt: null, lockedAt: null } }) : null;
        if (!device) return null;
        token.role = currentUser.role;
        token.branchId = currentUser.branchId;
        token.branchName = currentUser.branch?.name ?? null;
      }
      const role = typeof token.role === "string" ? token.role : "";
      const grant = await readStoredGrant(role, String(token.userId));
      token.pages = grant.pages;
      token.capabilities = grant.capabilities;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.deviceId = typeof token.deviceId === "string" ? token.deviceId : "";
        session.user.id = typeof token.userId === "string" ? token.userId : "";
        session.user.role = typeof token.role === "string" ? token.role : "CASHIER";
        session.user.branchId = typeof token.branchId === "string" ? token.branchId : null;
        session.user.branchName = typeof token.branchName === "string" ? token.branchName : null;
        session.user.pages = Array.isArray(token.pages) ? token.pages.filter((page): page is string => typeof page === "string") : [];
        session.user.capabilities = Array.isArray(token.capabilities) ? token.capabilities.filter((capability): capability is string => typeof capability === "string") : [];
      }
      return session;
    },
  },
});
