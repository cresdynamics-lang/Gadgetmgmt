import { ChartNoAxesCombined, CircleDollarSign, PackageCheck } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  delta: string;
  tone?: "green" | "amber" | "red" | "neutral";
};

const palette = {
  green: { icon: CircleDollarSign, accent: "bg-[#f4f4f2] text-[#111111]", rule: "border-t-[#111111]" },
  amber: { icon: PackageCheck, accent: "bg-[#fdf3df] text-[#8a5a12]", rule: "border-t-[#8a5a12]" },
  red: { icon: PackageCheck, accent: "bg-[#fdeceb] text-[#b3261e]", rule: "border-t-[#b3261e]" },
  neutral: { icon: ChartNoAxesCombined, accent: "bg-[#f4f4f2] text-[#111111]", rule: "border-t-[#6b6b66]" },
};

export function MetricCard({ label, value, delta, tone = "neutral" }: MetricCardProps) {
  const { icon: Icon, accent, rule } = palette[tone];
  return <article className={`metric-card overflow-hidden rounded-xl border border-t-2 border-[#e6e6e2] ${rule} bg-[#ffffff] p-5 transition-colors hover:bg-white`}>
    <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#111111]">{label}</p><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent}`}><Icon className="h-[17px] w-[17px]" strokeWidth={1.7}/></span></div>
    <p className="mt-5 text-[25px] font-semibold leading-none tracking-[-.05em] text-[#111111] sm:text-[28px]">{value}</p>
    <p className="mt-3 text-[11px] font-medium text-[#111111]">{delta}</p>
  </article>;
}
