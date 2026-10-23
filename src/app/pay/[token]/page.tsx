import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { Check, Clock3, CreditCard, ShieldCheck } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { PaymentSubmissionForm } from "./payment-submission-form";
import { RescheduleForm } from "./reschedule-form";
import { creditProgress } from "@/lib/credit-progress";
import { BrandLogo } from "@/components/brand-logo";

export const instant = false;
export const metadata = { robots: { index: false, follow: false } };

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default async function CustomerPaymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const plan = await prisma.creditPlan.findUnique({
    where: { portalTokenHash: tokenHash },
    include: {
      customer: { select: { name: true } },
      product: { select: { name: true, sku: true } },
      branch: { select: { name: true, phone: true } },
      installments: { orderBy: { sequence: "asc" } },
      paymentSubmissions: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, amount: true, reference: true, createdAt: true } },
    },
  });
  if (!plan) notFound();

  const completedInstallments = plan.installments.filter((installment) => installment.paidAt).length;
  const { totalObligation, paidToDate, percent: progress } = creditProgress(plan.totalAmount, plan.balance, plan.lateFeeAmount);

  return (
    <main className="min-h-screen bg-[#f4f3ed] px-4 py-10 text-[#111111] sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center gap-3"><BrandLogo variant="icon" on="dark" className="h-11 w-11 rounded-2xl" /><div><p className="font-semibold tracking-tight">GadgetHub</p><p className="text-[10px] uppercase tracking-[.18em] text-[#81867a]">Customer account</p></div></header>
        <section className="overflow-hidden rounded-3xl border border-[#e6e2d7] bg-[#fffefa] shadow-[0_22px_60px_rgba(0,0,0,.08)]">
          <div className="bg-[linear-gradient(125deg,#111111,#1a1a1a)] px-6 py-7 text-white sm:px-9 sm:py-9">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-[#e5e5e5]"><ShieldCheck className="h-3.5 w-3.5"/> Secure payment schedule</span>
            <p className="mt-6 text-sm text-white/65">Hello, {plan.customer.name}</p>
            <h1 className="mt-1 font-serif text-3xl font-medium">Your payment plan</h1>
            <p className="mt-2 text-sm text-white/65">{plan.product.name} · {plan.product.sku}</p>
            <div className="mt-7 grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-white/[.07] p-4">
              <div><p className="text-[10px] uppercase tracking-[.15em] text-white/55">Balance remaining</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(plan.balance)}</p></div>
              <div className="text-right"><p className="text-[10px] uppercase tracking-[.15em] text-white/55">Next installment</p><p className="mt-2 text-sm font-semibold">{plan.balance ? money(plan.installments.find((item) => !item.paidAt)?.amount ?? plan.balance) : "Paid in full"}</p><p className="mt-1 text-xs text-white/60">{plan.balance ? plan.nextDueDate.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) : "Thank you"}</p></div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-9 sm:py-8">
            <div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#898b7f]">Repayment progress</p><p className="mt-1 text-sm text-[#667066]">{money(paidToDate)} paid of {money(totalObligation)} · {completedInstallments} of {plan.termMonths} installments paid</p>{plan.lateFeeAmount > 0 ? <p className="mt-1 text-xs text-[#8b6c42]">Includes {money(plan.lateFeeAmount)} late fee applied under the account policy.</p> : null}</div><p className="font-semibold tabular-nums text-[#1a1a1a]">{progress}%</p></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ecece4]"><div className="h-full rounded-full bg-gradient-to-r from-[#1a1a1a] to-[#6b6b6b]" style={{ width: `${progress}%` }}/></div>

            <div className="mt-8 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Installment schedule</h2><p className="mt-1 text-xs text-[#83877c]">{plan.termMonths} month plan · scheduled amounts include any applied late fee</p></div><span className="inline-flex items-center gap-1.5 text-[10px] text-[#82877b]"><Clock3 className="h-3.5 w-3.5"/>Updated live</span></div>
            <div className="mt-3 divide-y divide-[#efede6] border-y border-[#e9e6dc]">
              {plan.installments.map((installment) => <div key={installment.id} className="flex items-center justify-between gap-3 py-3"><div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-full ${installment.paidAt ? "bg-[#e5e5e5] text-[#2d2d2d]" : "bg-[#f3f2ec] text-[#85877b]"}`}>{installment.paidAt ? <Check className="h-4 w-4"/> : <span className="text-[10px] font-semibold">{installment.sequence}</span>}</span><div><p className="text-xs font-medium text-[#1a1a1a]">Installment {installment.sequence}</p><p className="mt-0.5 text-[10px] text-[#898c81]">Due {installment.dueDate.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</p></div></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{money(installment.amount)}</p><p className={`mt-0.5 text-[9px] font-semibold uppercase tracking-[.1em] ${installment.paidAt ? "text-[#2d2d2d]" : "text-[#898c81]"}`}>{installment.paidAt ? "Paid" : installment.paidAmount ? `Part paid · ${money(installment.paidAmount)}` : "Due"}</p></div></div>)}
              {!plan.installments.length ? <div className="py-4 text-sm text-[#70776c]">Your account schedule is being prepared. Please contact the branch for current payment details.</div> : null}
            </div>

            {plan.paymentSubmissions.length ? <div className="mt-4 rounded-xl border border-[#eadfc7] bg-[#fbf7ed] px-4 py-3"><p className="text-xs font-semibold text-[#735d39]">Payment awaiting branch confirmation</p>{plan.paymentSubmissions.map((submission) => <p key={submission.id} className="mt-1 text-[10px] text-[#83755b]">{money(submission.amount)} · Ref {submission.reference} · Sent {submission.createdAt.toLocaleDateString("en-KE")}</p>)}</div> : null}

            <div className="mt-6 rounded-2xl border border-[#e9e3d5] bg-[#faf8f2] p-4 sm:p-5"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f1eadb] text-[#8e7448]"><CreditCard className="h-4 w-4"/></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#1a1a1a]">Pay by M-Pesa</p><p className="mt-1 text-xs leading-5 text-[#70766b]">Contact {plan.branch.name} at <a className="font-semibold text-[#1a1a1a] underline underline-offset-2" href={`tel:${plan.branch.phone}`}>{plan.branch.phone}</a> for the current payment instructions. Then submit your M-Pesa transaction code here.</p>{plan.balance > 0 ? <PaymentSubmissionForm token={token} scheduledAmount={plan.installments.find((item) => !item.paidAt)?.amount ?? plan.balance} balance={plan.balance}/> : <p className="mt-3 text-xs font-medium text-[#2d2d2d]">This account has been paid in full. Thank you.</p>}<p className="mt-2 text-[10px] leading-4 text-[#8b887c]">Payment references are reviewed by the branch before your balance changes. Never share your M-Pesa PIN or password.</p></div></div></div>
            {plan.balance > 0 ? <RescheduleForm token={token} /> : null}
            <p className="mt-6 text-center text-[10px] text-[#9a9a8d]">For account support, contact {plan.branch.name} · {plan.branch.phone}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
