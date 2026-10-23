import { ChartNoAxesCombined, CircleDollarSign, PackageCheck } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  delta: string;
  tone?: "green" | "amber" | "red" | "neutral";
};

const palette = {
  green: { icon: CircleDollarSign, accent: "bg-[#f5f5f5] text-[#2d2d2d]", rule: "border-t-[#4a4a4a]" },
  amber: { icon: PackageCheck, accent: "bg-[#f7f1e6] text-[#9a7848]", rule: "border-t-[#b4925f]" },
  red: { icon: PackageCheck, accent: "bg-[#f7ece8] text-[#a86755]", rule: "border-t-[#b97865]" },
  neutral: { icon: ChartNoAxesCombined, accent: "bg-[#e5e5e5] text-[#657064]", rule: "border-t-[#6b6b6b]" },
};

export function MetricCard({ label, value, delta, tone = "neutral" }: MetricCardProps) {
  const { icon: Icon, accent, rule } = palette[tone];
  return <article className={`metric-card overflow-hidden rounded-xl border border-t-2 border-[#e9e7de] ${rule} bg-[#fffefa] p-5 transition-colors hover:bg-white`}>
    <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#7f8277]">{label}</p><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent}`}><Icon className="h-[17px] w-[17px]" strokeWidth={1.7}/></span></div>
    <p className="mt-5 text-[25px] font-semibold leading-none tracking-[-.05em] text-[#111111] sm:text-[28px]">{value}</p>
    <p className="mt-3 text-[11px] font-medium text-[#82847a]">{delta}</p>
  </article>;
}
