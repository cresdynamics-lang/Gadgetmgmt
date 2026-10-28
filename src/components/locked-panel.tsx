"use client";

import { LockKeyhole } from "lucide-react";

import { requestApproval } from "@/components/approval-gate";

/** Placeholder for figures behind a restricted permission, with a way to request a code. */
export function LockedPanel({ permission, title }: { permission: string; title: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[#d4d4d4] bg-[#fafafa] px-4 py-4">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff2e8] text-[#a15d3d]"><LockKeyhole className="h-4 w-4"/></span><div><p className="text-sm font-semibold text-[#111111]">{title}</p><p className="mt-0.5 text-xs text-[#6b6b6b]">On condition. Ask the super admin for the emailed 5-minute code.</p></div></div>
    <button type="button" onClick={() => requestApproval(permission)} className="rounded-xl bg-[#111111] px-3.5 py-2 text-xs font-semibold text-white">Request code</button>
  </div>;
}
