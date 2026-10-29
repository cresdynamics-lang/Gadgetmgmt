import { allPermissions, hasPermission, permissionLabels, roleNames } from "@/lib/access";
import { nairobiDateKey } from "@/lib/sales-periods";
import { runTool, toolsFor, type AssistantUser } from "@/lib/assistant/tools";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_ASSISTANT_MODEL = "anthropic/claude-sonnet-5.5";
const MAX_TOOL_ROUNDS = 8;

export type ChatTurn = { role: "user" | "assistant"; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ApiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export function assistantConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function assistantModel() {
  return process.env.OPENROUTER_MODEL || DEFAULT_ASSISTANT_MODEL;
}

/** One chat request to OpenRouter (OpenAI-compatible API). */
export async function openRouterChat(body: Record<string, unknown>, timeoutMs = 60_000) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("ASSISTANT_NOT_CONFIGURED");
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_BASE_URL || "https://app.gadgethubke.com",
      "X-Title": "GadgetHub Operations",
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: assistantModel(), ...body }),
  });
  const result = await response.json().catch(() => null) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]; error?: { message?: string } } | null;
  if (!response.ok || !result?.choices?.[0]?.message) {
    throw new Error(`AI provider returned ${response.status}${result?.error?.message ? `: ${result.error.message}` : ""}`);
  }
  return result.choices[0].message;
}

function systemPrompt(user: AssistantUser, now: Date) {
  const allowed = allPermissions.filter((permission) => hasPermission(user, permission)).map((permission) => permissionLabels[permission]);
  const blocked = allPermissions.filter((permission) => !hasPermission(user, permission)).map((permission) => permissionLabels[permission]);
  return [
    "You are GadgetHub AI, the operations assistant for Gadget Hub, an Apple products shop at Norwich Union Hse, Nairobi, Kenya.",
    "The shop sells new and Ex-UK iPhones, iPads, Macs, Apple Watches and AirPods, takes trade-ins, and sells on Lipa Mdogo Mdogo (installments: at least 40% deposit, the rest paid monthly). Customers are reminded 3 days before and on the due day, and flagged 3 days after a missed payment. M-Pesa payments settle to Stanbic Bank.",
    `Today is ${nairobiDateKey(now)} (Nairobi time, UTC+3). Money is in Kenyan shillings; write it like "KES 158,000".`,
    `You are talking to ${user.name ?? "a team member"} (${roleNames[user.role] ?? user.role}).`,
    `They may see: ${allowed.join(", ") || "nothing"}.`,
    blocked.length ? `They may NOT see: ${blocked.join(", ")}. If they ask about these, say plainly that their account does not have access to that information and that the super admin can grant it. Do not hint at, estimate or work around the answer.` : "",
    "Rules:",
    "- Use the tools to get facts. Never invent or estimate figures, names or dates; if a tool returns nothing, say so.",
    "- Super admin and anyone with the matching permission can read finance, staff, customer and website-admin records stored in this operations app. The public shop is standalone and does not send live visitors, WhatsApp taps or orders here.",
    "- You can only read data. You cannot record sales, change prices, send messages or edit anything; say so if asked, and point to the right page.",
    "- Answer directly first, then the key details. Keep it short and practical. Use short lists for people who owe money (name, amount due, due date, days overdue, phone).",
    "- Formatting: plain sentences, short \"- \" lists and **bold** only. Never use tables, headings or code blocks; the chat cannot show them.",
    "- Suggest a concrete next step when useful (who to call first, what to restock).",
  ].filter(Boolean).join("\n");
}

const toolLabel = (name: string) => toolsFor({ role: "OWNER", id: "", branchId: null, permissions: allPermissions }).find((tool) => tool.name === name)?.label ?? name;

/** Answer a question by letting the model call the read-only tools this person is allowed to use. */
export async function askAssistant(user: AssistantUser, history: ChatTurn[], now = new Date()) {
  const tools = toolsFor(user);
  const messages: ApiMessage[] = [{ role: "system", content: systemPrompt(user, now) }, ...history.map((turn) => ({ role: turn.role, content: turn.content }) as ApiMessage)];
  const used = new Set<string>();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const reply = await openRouterChat({
      messages,
      max_tokens: 1500,
      temperature: 0.2,
      ...(tools.length ? { tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), tool_choice: "auto" } : {}),
    });
    const calls = reply.tool_calls ?? [];
    if (!calls.length) return { answer: (reply.content ?? "").trim() || "I could not find an answer to that.", sources: [...used].map(toolLabel), model: assistantModel() };

    messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
      const result = await runTool(call.function.name, args, user, now).catch((error: unknown) => ({ error: error instanceof Error ? error.message.slice(0, 300) : "Tool failed." }));
      used.add(call.function.name);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 60_000) });
    }
  }
  return { answer: "That needed more steps than I am allowed. Try asking a narrower question.", sources: [...used].map(toolLabel), model: assistantModel() };
}
