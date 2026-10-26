import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { askAssistant, assistantConfigured } from "@/lib/assistant/agent";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

const chatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(20),
}).strict().refine((data) => data.messages[data.messages.length - 1].role === "user");

const hourlyLimit = () => Math.max(1, Number(process.env.AI_QUESTIONS_PER_HOUR) || 30);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "assistant.use")) return denied(session.user, "assistant.use", "Your account does not have access to the AI assistant.");
  if (!assistantConfigured()) return NextResponse.json({ error: "The AI assistant is not connected yet. Add the OpenRouter key to the server settings." }, { status: 503 });

  const parsed = chatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ask a question of up to 4,000 characters." }, { status: 400 });

  const asked = await prisma.activityEvent.count({ where: { userId: session.user.id, action: "AI_QUESTION", createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (asked >= hourlyLimit()) return NextResponse.json({ error: `You have reached ${hourlyLimit()} AI questions this hour. Try again a little later.` }, { status: 429 });

  const question = parsed.data.messages[parsed.data.messages.length - 1].content;
  await recordActivity({ userId: session.user.id, sessionId: session.user.sessionId, action: "AI_QUESTION", summary: `Asked the AI assistant: ${question.slice(0, 160)}` });
  try {
    const result = await askAssistant({ ...session.user, permissions: session.user.permissions, restricted: session.user.restricted }, parsed.data.messages);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("AI assistant failed", message);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return NextResponse.json({ error: "The AI took too long to answer. Try a narrower question." }, { status: 504 });
    return NextResponse.json({ error: "The AI assistant could not answer right now. Please try again." }, { status: 502 });
  }
}
