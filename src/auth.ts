import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

if (process.env.NODE_ENV === "production") {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 43 || secret === "replace-with-a-long-random-secret") {
    throw new Error("Set NEXTAUTH_SECRET to a cryptographically generated 32-byte base64 value in production.");
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { branch: { select: { name: true } } },
        });

        if (!user || user.status !== "ACTIVE") return null;
        if (!(await compare(parsed.data.password, user.passwordHash))) return null;

        return {
          id: user.id,
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
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.branchId = user.branchId;
        token.branchName = user.branchName;
      } else if (typeof token.userId === "string" && token.userId) {
        return prisma.user.findUnique({
          where: { id: token.userId },
          select: { role: true, status: true, branchId: true, branch: { select: { name: true } } },
        }).then((currentUser) => {
          if (!currentUser || currentUser.status !== "ACTIVE") return null;
          token.role = currentUser.role;
          token.branchId = currentUser.branchId;
          token.branchName = currentUser.branch?.name ?? null;
          return token;
        });
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.userId === "string" ? token.userId : "";
        session.user.role = typeof token.role === "string" ? token.role : "CASHIER";
        session.user.branchId = typeof token.branchId === "string" ? token.branchId : null;
        session.user.branchName = typeof token.branchName === "string" ? token.branchName : null;
      }
      return session;
    },
  },
});