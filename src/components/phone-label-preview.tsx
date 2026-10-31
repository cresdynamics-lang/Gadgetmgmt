"use client";

import { PHONE_LABEL, phoneLabelCss, phoneLabelInnerHtml, type PhoneLabelData } from "@/lib/phone-label";

export function PhoneLabelPreview({ device }: { device: PhoneLabelData }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
      <figcaption className="flex items-center justify-between gap-2 border-b border-[#e5e5e5] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#6b6b6b]">
        <span>Back-of-phone label</span>
        <span>{PHONE_LABEL.widthMm} × {PHONE_LABEL.heightMm} mm print size</span>
      </figcaption>
      <div className="flex justify-center overflow-x-auto bg-[#f5f5f5] p-3">
        <div
          className="origin-top bg-white shadow-sm"
          style={{ width: `${PHONE_LABEL.widthMm}mm`, height: `${PHONE_LABEL.heightMm}mm` }}
          dangerouslySetInnerHTML={{ __html: `${phoneLabelInnerHtml(device)}<style>${phoneLabelCss}</style>` }}
        />
      </div>
    </figure>
  );
}

export function BatteryHealthField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const percent = value.replace(/[^\d]/g, "").slice(0, 3);
  return (
    <label className={className}>
      <span className="block text-xs font-semibold text-[#1a1a1a]">Battery health to print on the sticker</span>
      <span className="mt-0.5 block text-[11px] text-[#6b6b6b]">Settings → Battery → Battery Health. This percentage is printed large on the label taped behind the phone.</span>
      <span className="mt-2 flex items-end gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={percent}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d]/g, "").slice(0, 3);
            onChange(next && Number(next) > 100 ? "100" : next);
          }}
          placeholder="100"
          className="h-14 w-28 rounded-xl border border-[#111111] bg-white text-center text-2xl font-bold tabular-nums text-[#111111] outline-none focus:ring-2 focus:ring-[#e5e5e5]"
        />
        <span className="pb-2 text-lg font-semibold text-[#111111]">%</span>
      </span>
    </label>
  );
}
