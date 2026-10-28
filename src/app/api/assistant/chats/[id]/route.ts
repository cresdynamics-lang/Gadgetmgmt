import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/** One saved chat, only for the person who owns it. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "assistant.use")) return denied(session.user, "assistant.use", "Your account does not have access to the AI assistant.");
  const { id } = await context.params;
  const chat = await prisma.assistantChat.findFirst({ where: { id, userId: session.user.id }, select: { id: true, title: true, messages: true, updatedAt: true } });
  if (!chat) return NextResponse.json({ error: "That chat was not found." }, { status: 404 });
  return NextResponse.json(chat, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await context.params;
  const removed = await prisma.assistantChat.deleteMany({ where: { id, userId: session.user.id } });
  if (!removed.count) return NextResponse.json({ error: "That chat was not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
