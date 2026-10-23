"use client";

import { useEffect, useState, type FormEvent } from "react";

type Policy = { id: string; branchId: string; graceDays: number; lateFeeAmount: number; minimumDepositPercent: number; defaultCreditLimit: number; earlySettlementDiscountPercent: number; managerEscalationDays: number; ownerEscalationDays: number };
type Branch = { id: string; name: string };
const defaults = { graceDays: 3, lateFeeAmount: 0, minimumDepositPercent: 40, defaultCreditLimit: 0, earlySettlementDiscountPercent: 0, managerEscalationDays: 3, ownerEscalationDays: 7 };

export function CreditPolicyForm({ owner }: { owner: boolean }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [branchId, setBranchId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, typeof defaults>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/credit/policy", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Policy could not be loaded.");
      setBranches(data.branches);
      setPolicies(data.policies);
      if (data.branches[0]) setBranchId(data.branches[0].id);
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Policy could not be loaded."));
  }, []);

  const policy = policies.find((item) => item.branchId === branchId);
  const values = drafts[branchId] ?? (policy ? { graceDays: policy.graceDays, lateFeeAmount: 0, minimumDepositPercent: policy.minimumDepositPercent, defaultCreditLimit: policy.defaultCreditLimit, earlySettlementDiscountPercent: policy.earlySettlementDiscountPercent, managerEscalationDays: policy.managerEscalationDays, ownerEscalationDays: policy.ownerEscalationDays } : defaults);
  const setValues = (update: (current: typeof defaults) => typeof defaults) => setDrafts((current) => ({ ...current, [branchId]: update(current[branchId] ?? values) }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/credit/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId, ...values }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Policy could not be saved.");
      setPolicies((current) => [...current.filter((item) => item.branchId !== data.branchId), data]);
      setDrafts((current) => { const next = { ...current }; delete next[data.branchId]; return next; });
      setMessage("Policy saved. New Lipa plans will use these rules.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Policy could not be saved."); }
    finally { setBusy(false); }
  }

  const field = (key: keyof typeof defaults, label: string, helper: string, max = 2_000_000_000, min = 0) => <label key={key} className="block text-xs font-medium text-[#343941]">{label}<input type="number" min={min} max={max} step="1" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: Number(event.target.value) }))} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm tabular-nums"/><span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">{helper}</span></label>;

  if (!branches.length) return null;
  return <details className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5">
    <summary className="cursor-pointer text-sm font-semibold text-[#20242b]">Lipa policy <span className="ml-2 text-xs font-normal text-[var(--muted)]">{owner ? "Set branch rules" : "Manage this branch"}</span></summary>
    <form onSubmit={save} className="mt-4 space-y-4">
      {owner ? <label className="block max-w-sm text-xs font-medium text-[#343941]">Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {field("minimumDepositPercent", "Minimum deposit (%)", "Cannot be below 40%. Plans then split the remaining amount over 3, 6 or 12 months.", 100, 40)}
        {field("defaultCreditLimit", "Default customer limit (KES)", "Zero means no branch default limit; a customer limit still applies.")}
        {field("graceDays", "Grace period (days)", "Days after the due date before late follow-up.", 30)}
        <label className="block text-xs font-medium text-[#343941]">Late fee (KES)<input type="number" value="0" readOnly disabled className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[#f5f5f5] px-3 py-2.5 text-sm tabular-nums text-[#788178]"/><span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">Unavailable until the system can record signed customer consent and the agreed fee terms.</span></label>
        {field("earlySettlementDiscountPercent", "Early settlement discount (%)", "Reserved for early-payoff calculation in the signed agreement.", 100)}
        {field("managerEscalationDays", "Manager escalation (days late)", "Notify the branch manager after this many days.", 60)}
        {field("ownerEscalationDays", "Owner escalation (days late)", "Notify the owner after this many days.", 90)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3"><p role="status" className="text-xs text-[var(--muted)]">{message || "Policy applies to new plans and scheduled collection follow-up."}</p><button disabled={busy || !branchId} className="rounded-lg bg-[var(--signal)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save policy"}</button></div>
    </form>
  </details>;
}
