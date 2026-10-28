"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowUp, Database, History, LoaderCircle, Plus, Sparkles, Trash2, X } from "lucide-react";

type Turn = { role: "user" | "assistant"; content: string; sources?: string[] };
type ChatSummary = { id: string; title: string; updatedAt: string };

const starters = [
  "How much did we make this week?",
  "How much did we make this month?",
  "Who hasn't paid and how much do they owe?",
  "Who needs to pay in the next 7 days?",
  "What's low in stock?",
];
const CURRENT_CHAT_KEY = "gadgethub:assistant-chat";

/** Light formatting for answers: **bold**, "- " lists and line breaks. */
function renderAnswer(text: string) {
  const bold = (line: string): ReactNode[] => line.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>);
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={`list-${blocks.length}`} className="my-1.5 list-disc space-y-1 pl-5">{list}</ul>); list = []; } };
  text.split("\n").forEach((raw, index) => {
    const line = raw.trimEnd();
    const item = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (item) { list.push(<li key={index}>{bold(item[1])}</li>); return; }
    flush();
    if (line.trim()) blocks.push(<p key={index} className="my-1.5">{bold(line.replace(/^#+\s*/, ""))}</p>);
  });
  flush();
  return blocks;
}

const when = (iso: string) => {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return date.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return date.toLocaleDateString("en-KE", { weekday: "short" });
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};

const remember = (chatId: string | null) => {
  try { if (chatId) sessionStorage.setItem(CURRENT_CHAT_KEY, chatId); else sessionStorage.removeItem(CURRENT_CHAT_KEY); } catch { /* storage unavailable */ }
};

/** GadgetHub AI as a floating chat with saved history, available on every page. */
export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [configured, setConfigured] = useState(true);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const loadChats = useCallback(async () => {
    const response = await fetch("/api/assistant", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { configured: boolean; chats: ChatSummary[] };
    setConfigured(result.configured);
    setChats(result.chats);
  }, []);

  const openChat = useCallback(async (id: string) => {
    setError("");
    const response = await fetch(`/api/assistant/chats/${id}`, { cache: "no-store" });
    if (!response.ok) { remember(null); setChatId(null); setTurns([]); return; }
    const result = await response.json() as { id: string; messages: Turn[] };
    setChatId(result.id);
    setTurns(result.messages);
    remember(result.id);
    setView("chat");
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [turns, loading, view]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const frame = window.requestAnimationFrame(() => input.current?.focus());
    return () => { window.removeEventListener("keydown", onKey); window.cancelAnimationFrame(frame); };
  }, [open, view]);

  /** Open the window, refresh the chat list, and bring back the chat in progress on this tab. */
  function openDock() {
    setOpen(true);
    void loadChats();
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(CURRENT_CHAT_KEY); } catch { saved = null; }
    if (saved && !chatId) void openChat(saved);
  }

  function newChat() {
    setChatId(null);
    setTurns([]);
    setQuestion("");
    setError("");
    setView("chat");
    remember(null);
  }

  async function removeChat(id: string) {
    const response = await fetch(`/api/assistant/chats/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    setChats((current) => current.filter((chat) => chat.id !== id));
    if (id === chatId) newChat();
  }

  async function ask(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const before = turns;
    setTurns([...before, { role: "user", content }]);
    setQuestion("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content.slice(0, 4000), ...(chatId ? { chatId } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The AI assistant could not answer.");
      setChatId(result.chatId);
      remember(result.chatId);
      setTurns([...before, { role: "user", content }, { role: "assistant", content: result.answer, sources: result.sources }]);
      void loadChats();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI assistant could not answer.");
      setTurns(before);
      setQuestion(content);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  const iconButton = "grid h-9 w-9 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white";

  return <>
    {!open ? <button type="button" onClick={openDock} aria-label="Open GadgetHub AI" className="fixed bottom-5 right-5 z-[70] inline-flex h-14 items-center gap-2 rounded-full bg-[#111111] px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,.28)] transition hover:-translate-y-0.5 hover:bg-[#1a1a1a] print:hidden">
      <Sparkles className="h-5 w-5"/><span className="hidden sm:inline">Ask AI</span>
    </button> : null}

    {open ? <section role="dialog" aria-modal="false" aria-label="GadgetHub AI" className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(0,0,0,.3)] sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(660px,calc(100vh-40px))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-[#e5e5e5] print:hidden">
      <header className="flex items-center gap-2 bg-[#111111] px-3 py-2.5 text-white">
        {view === "history" ? <button type="button" onClick={() => setView("chat")} aria-label="Back to chat" className={iconButton}><ArrowLeft className="h-4 w-4"/></button> : <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"><Sparkles className="h-4 w-4"/></span>}
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{view === "history" ? "Chat history" : "GadgetHub AI"}</p><p className="truncate text-[10px] text-white/55">{view === "history" ? `${chats.length} saved ${chats.length === 1 ? "chat" : "chats"}` : "Reads your records live, within your permissions"}</p></div>
        {view === "chat" ? <button type="button" onClick={() => { setView("history"); void loadChats(); }} aria-label="Chat history" title="Chat history" className={iconButton}><History className="h-4 w-4"/></button> : null}
        <button type="button" onClick={newChat} aria-label="New chat" title="New chat" className={iconButton}><Plus className="h-4 w-4"/></button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close GadgetHub AI" className={iconButton}><X className="h-4 w-4"/></button>
      </header>

      {view === "history" ? <div className="flex-1 overflow-y-auto">
        {chats.length ? <ul className="divide-y divide-[#f0f0f0]">
          {chats.map((chat) => <li key={chat.id} className={`flex items-center gap-2 px-3 ${chat.id === chatId ? "bg-[#f5f5f5]" : ""}`}>
            <button type="button" onClick={() => void openChat(chat.id)} className="min-w-0 flex-1 py-3 text-left"><span className="block truncate text-sm font-medium text-[#1a1a1a]">{chat.title}</span><span className="text-[11px] text-[#8a8a8a]">{when(chat.updatedAt)}</span></button>
            <button type="button" onClick={() => void removeChat(chat.id)} aria-label={`Delete chat: ${chat.title}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#9a9a9a] hover:bg-[#fff2ee] hover:text-[#a15d3d]"><Trash2 className="h-4 w-4"/></button>
          </li>)}
        </ul> : <p className="px-4 py-10 text-center text-sm text-[#6b6b6b]">No saved chats yet. Questions you ask are saved here.</p>}
      </div> : <>
        <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-4" aria-live="polite">
          {!configured ? <p className="rounded-xl bg-[#f5f5f5] px-3 py-3 text-sm text-[#4a4a4a]">The AI assistant is not connected yet. It starts working as soon as the OpenRouter key is added to the server settings.</p> : null}
          {configured && !turns.length ? <div>
            <p className="mb-3 text-sm text-[#4a4a4a]">Ask about sales, payments, Lipa accounts or stock.</p>
            <div className="flex flex-wrap gap-2">{starters.map((starter) => <button key={starter} type="button" onClick={() => void ask(starter)} className="min-h-10 rounded-full border border-[#e5e5e5] bg-[#fafafa] px-3.5 text-left text-xs font-medium text-[#2d2d2d] transition hover:border-[#111111] hover:bg-white">{starter}</button>)}</div>
          </div> : null}
          {turns.map((turn, index) => turn.role === "user"
            ? <div key={index} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#111111] px-3.5 py-2.5 text-sm text-white">{turn.content}</div>
            : <div key={index} className="max-w-[92%]">
              <div className="rounded-2xl rounded-bl-md bg-[#f5f5f5] px-3.5 py-2.5 text-sm leading-6 text-[#1a1a1a]">{renderAnswer(turn.content)}</div>
              {turn.sources?.length ? <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-[#8a8a8a]"><Database className="h-3 w-3"/>Checked: {turn.sources.join(", ")}</p> : null}
            </div>)}
          {loading ? <p className="inline-flex items-center gap-2 text-xs text-[#6b6b6b]"><LoaderCircle className="h-3.5 w-3.5 animate-spin"/>Checking the records…</p> : null}
          {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p> : null}
          <div ref={end}/>
        </div>
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-[#e5e5e5] px-3 py-3">
          <textarea ref={input} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(question); } }} rows={1} maxLength={4000} disabled={!configured} placeholder="Ask anything about the business…" aria-label="Ask the AI assistant" className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-3.5 py-2.5 text-base outline-none focus:border-[#111111] focus:bg-white disabled:opacity-60 sm:text-sm"/>
          <button disabled={loading || !question.trim() || !configured} aria-label="Send question" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#111111] text-white disabled:bg-[#d4d4d4]"><ArrowUp className="h-4 w-4"/></button>
        </form>
      </>}
    </section> : null}
  </>;
}
