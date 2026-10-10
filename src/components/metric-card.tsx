type MetricCardProps = {
  label: string;
  value: string;
  delta: string;
  tone?: "green" | "amber" | "red" | "neutral";
};

const palette = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export function MetricCard({ label, value, delta, tone = "neutral" }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#666]">{label}</p>
        <span className={`rounded-full px-2 py-1 text-[10px] font-medium ring-1 ${palette[tone]}`}>{delta}</span>
      </div>
      <div className="mb-2 text-3xl font-semibold tracking-tight text-[#0a0a0a]">{value}</div>
      <div className="h-1.5 w-20 rounded-full bg-[#f0f0f0]">
        <div className={`h-1.5 rounded-full ${tone === "red" ? "bg-red-500" : tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-[#0a0a0a]"}`} style={{ width: tone === "red" ? "72%" : tone === "green" ? "82%" : tone === "amber" ? "63%" : "54%" }} />
      </div>
    </div>
  );
}
