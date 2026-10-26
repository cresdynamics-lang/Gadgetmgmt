"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUp, Database, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";

type Turn = { role: "user" | "assistant"; content: string; sources?: string[] };

const starters = [
  "How much did we make this week?",
  "How much did we make this month?",
  "Who hasn't paid and how much do they owe?",
  "Who needs to pay in the next 7 days?",
  "What's low in stock?",
];

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

export function AssistantPanel({ configured }: { configured: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [turns, loading]);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...turns, { role: "user" as const, content }];
    setTurns(next);
    setQuestion("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-20).map(({ role, content: body }) => ({ role, content: body.slice(0, 4000) })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The AI assistant could not answer.");
      setTurns([...next, { role: "assistant", content: result.answer, sources: result.sources }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI assistant could not answer.");
      setTurns(turns);
      setQuestion(content);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return <section aria-labelledby="assistant-heading" className="overflow-hidden rounded-[18px] border border-[#e5e5e5] bg-white shadow-[0_3px_14px_rgba(0,0,0,.03)]">
    <div className="flex items-center justify-between gap-3 border-b border-[#e5e5e5] px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#111111] text-white"><Sparkles className="h-4 w-4"/></span>
        <div><h3 id="assistant-heading" className="text-sm font-semibold text-[#1a1a1a]">GadgetHub AI</h3><p className="text-[11px] text-[#6b6b6b]">Ask about sales, payments, Lipa accounts and stock. It reads the records live.</p></div>
      </div>
      {turns.length ? <button type="button" onClick={() => { setTurns([]); setError(""); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#6b6b6b] hover:bg-[#f5f5f5]"><RotateCcw className="h-3.5 w-3.5"/>New chat</button> : null}
    </div>

    {!configured ? <p className="px-4 py-5 text-sm text-[#6b6b6b] sm:px-5">The AI assistant is not connected yet. It starts working as soon as the OpenRouter key is added to the server settings.</p> : <>
      <div className="max-h-[480px] space-y-3 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {!turns.length ? <div className="flex flex-wrap gap-2">{starters.map((starter) => <button key={starter} type="button" onClick={() => void ask(starter)} className="min-h-10 rounded-full border border-[#e5e5e5] bg-[#fafafa] px-3.5 text-xs font-medium text-[#2d2d2d] transition hover:border-[#111111] hover:bg-white">{starter}</button>)}</div> : null}
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
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-[#e5e5e5] px-3 py-3 sm:px-4">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(question); } }} rows={1} maxLength={4000} placeholder="Ask anything about the business…" aria-label="Ask the AI assistant" className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-3.5 py-2.5 text-base outline-none focus:border-[#111111] focus:bg-white sm:text-sm"/>
        <button disabled={loading || !question.trim()} aria-label="Send question" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#111111] text-white disabled:bg-[#d4d4d4]"><ArrowUp className="h-4 w-4"/></button>
      </form>
    </>}
  </section>;
}
