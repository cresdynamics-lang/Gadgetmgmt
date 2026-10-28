import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { askAssistant, assistantConfigured, type ChatTurn } from "@/lib/assistant/agent";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

const askSchema = z.object({
  chatId: z.string().cuid().optional(),
  message: z.string().trim().min(1).max(4000),
}).strict();

type StoredTurn = ChatTurn & { sources?: string[] };
const hourlyLimit = () => Math.max(1, Number(process.env.AI_QUESTIONS_PER_HOUR) || 30);
const storedTurns = (value: Prisma.JsonValue): StoredTurn[] => Array.isArray(value) ? value.filter((turn): turn is StoredTurn => Boolean(turn && typeof turn === "object" && "role" in turn && "content" in turn)) as StoredTurn[] : [];

/** The signed-in person's saved chats, newest first. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "assistant.use")) return denied(session.user, "assistant.use", "Your account does not have access to the AI assistant.");
  const chats = await prisma.assistantChat.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: "desc" }, take: 40, select: { id: true, title: true, updatedAt: true } });
  return NextResponse.json({ configured: assistantConfigured(), chats }, { headers: { "Cache-Control": "no-store" } });
}

/** Ask a question, continuing a saved chat or starting a new one. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "assistant.use")) return denied(session.user, "assistant.use", "Your account does not have access to the AI assistant.");
  if (!assistantConfigured()) return NextResponse.json({ error: "The AI assistant is not connected yet. Add the OpenRouter key to the server settings." }, { status: 503 });

  const parsed = askSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ask a question of up to 4,000 characters." }, { status: 400 });

  const chat = parsed.data.chatId ? await prisma.assistantChat.findFirst({ where: { id: parsed.data.chatId, userId: session.user.id }, select: { id: true, messages: true } }) : null;
  if (parsed.data.chatId && !chat) return NextResponse.json({ error: "That chat was not found." }, { status: 404 });

  const asked = await prisma.activityEvent.count({ where: { userId: session.user.id, action: "AI_QUESTION", createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (asked >= hourlyLimit()) return NextResponse.json({ error: `You have reached ${hourlyLimit()} AI questions this hour. Try again a little later.` }, { status: 429 });

  const question = parsed.data.message;
  const previous = chat ? storedTurns(chat.messages) : [];
  await recordActivity({ userId: session.user.id, sessionId: session.user.sessionId, action: "AI_QUESTION", summary: `Asked the AI assistant: ${question.slice(0, 160)}` });
  try {
    const history: ChatTurn[] = [...previous.slice(-19).map(({ role, content }) => ({ role, content })), { role: "user", content: question }];
    const result = await askAssistant({ ...session.user, permissions: session.user.permissions, restricted: session.user.restricted }, history);
    const messages = [...previous, { role: "user", content: question }, { role: "assistant", content: result.answer, sources: result.sources }] as Prisma.InputJsonValue;
    const saved = chat
      ? await prisma.assistantChat.update({ where: { id: chat.id }, data: { messages }, select: { id: true } })
      : await prisma.assistantChat.create({ data: { userId: session.user.id, title: question.replace(/\s+/g, " ").slice(0, 70), messages }, select: { id: true } });
    return NextResponse.json({ chatId: saved.id, answer: result.answer, sources: result.sources }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("AI assistant failed", error instanceof Error ? error.message : "unknown error");
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return NextResponse.json({ error: "The AI took too long to answer. Try a narrower question." }, { status: 504 });
    return NextResponse.json({ error: "The AI assistant could not answer right now. Please try again." }, { status: 502 });
  }
}
