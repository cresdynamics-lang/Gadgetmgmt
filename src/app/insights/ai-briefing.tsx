"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";

type Insight = { title: string; happened: string; compared: string; matters: string; action: string; tone: "good" | "watch" | "risk"; destination: "/sales" | "/inventory" | "/credit" | "/customers" | "/notifications" };
type Briefing = { headline: string; summary: string; insights: Insight[]; generatedAt: string; model: string; sources?:string[]; coverage?:string };

const toneStyles = {
  good: { card: "border-[var(--border)] bg-[var(--panel)]", icon: "bg-[var(--accent-soft)] text-[var(--accent-text)]", label: "Good" },
  watch: { card: "border-[#8a5a12] bg-[var(--panel)]", icon: "bg-[var(--warning-soft)] text-[var(--warning-text)]", label: "Watch" },
  risk: { card: "border-[#b3261e] bg-[var(--panel)]", icon: "bg-[var(--danger-soft)] text-[var(--danger-text)]", label: "At risk" },
};
const destinationLabels: Record<Insight["destination"], string> = {
  "/sales": "Open sales",
  "/inventory": "Review inventory",
  "/credit": "Open collections",
  "/customers": "Open customers",
  "/notifications": "Review messages",
};

export function AiBriefing({ configured }: { configured: boolean }) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateBriefing() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/insights", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The briefing could not be generated.");
      setBriefing(result as Briefing);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The briefing could not be generated. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_3px_14px_rgb(0_0_0/.035)]">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[var(--accent-soft)] text-[var(--accent-text)]"><Sparkles className="h-[18px] w-[18px]" /></span>
        <div><h2 className="text-sm font-semibold text-[var(--foreground)]">AI business briefing</h2><p className="mt-1 text-xs text-[var(--muted)]">A practical read of the last 30 days</p></div>
      </div>
      <button onClick={generateBriefing} disabled={loading || !configured} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a7d56] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-55">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Reading your numbers…" : briefing ? "Refresh briefing" : "Generate briefing"}
      </button>
    </div>
    <div className="p-5 sm:p-6">
      {!configured && <div role="status" className="flex items-start gap-3 rounded-xl border border-[#8a5a12] bg-[var(--panel)] p-4 text-sm text-[var(--warning-text)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>Connect an OpenAI API key in the server environment to generate a live briefing. The insights page is ready; no key is exposed to the browser.</p></div>}
      {error && <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-[#b3261e] bg-[var(--panel)] p-4 text-sm text-[var(--danger-text)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
      {!briefing && configured && <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-5 py-7 text-center"><p className="font-serif text-lg text-[var(--foreground)]">Turn today’s figures into clear next steps.</p><p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-[var(--muted)]">The AI reviews store-level totals, recent sales movement, stock levels, and Lipa ageing. Aggregate figures go to your configured AI provider; customer names, phone numbers, and individual customer records stay in GadgetHub.</p></div>}
      {briefing && <div aria-live="polite"><p className="security-detail">{briefing.coverage}</p><nav aria-label="Briefing data sources" className="flex flex-wrap gap-3">{briefing.sources?.map(path=><Link className="security-link" key={path} href={path}>Source: {path.slice(1)}</Link>)}</nav>
        <div className="mb-5 rounded-xl bg-[var(--background)] px-4 py-4 sm:px-5"><p className="font-serif text-xl leading-snug text-[var(--foreground)]">{briefing.headline}</p><p className="mt-2 max-w-4xl text-sm leading-relaxed text-[var(--foreground)]">{briefing.summary}</p></div>
        <div className="grid gap-3 lg:grid-cols-2">
          {briefing.insights.map((insight, index) => {
            const tone = toneStyles[insight.tone];
            return <article key={`${insight.title}-${index}`} className={`rounded-xl border p-4 ${tone.card}`}>
              <div className="flex items-start gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${tone.icon}`}><span className="text-[11px] font-bold">{String(index + 1).padStart(2, "0")}</span></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-[var(--foreground)]">{insight.title}</h3><span className="rounded-full bg-[var(--panel)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--foreground)]">{tone.label}</span></div>
                <dl className="mt-3 space-y-2.5 text-xs leading-relaxed text-[var(--foreground)]">
                  <div><dt className="inline font-semibold text-[var(--foreground)]">What happened · </dt><dd className="inline">{insight.happened}</dd></div>
                  <div><dt className="inline font-semibold text-[var(--foreground)]">Compared with · </dt><dd className="inline">{insight.compared}</dd></div>
                  <div><dt className="inline font-semibold text-[var(--foreground)]">Why it matters · </dt><dd className="inline">{insight.matters}</dd></div>
                  <div className="flex items-start gap-1.5 pt-0.5 text-[var(--foreground)]"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0"/><div><dt className="inline font-semibold">Next step · </dt><dd className="inline">{insight.action}</dd></div></div>
                </dl>
                <Link href={insight.destination} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[10px] font-semibold text-[var(--foreground)] transition hover:border-[#6b6b66] hover:bg-[var(--panel)]">{destinationLabels[insight.destination]}<ArrowRight className="h-3 w-3"/></Link>
              </div></div>
            </article>;
          })}
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-[10px] text-[var(--muted)]"><ArrowRight className="h-3 w-3"/>Generated {new Date(briefing.generatedAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })} · AI suggestions are for owner review</p>
      </div>}
    </div>
  </section>;
}
