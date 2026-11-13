import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { Clock3, ShieldCheck } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { ThirdPartyPaymentForm } from "./third-party-payment-form";

export const instant = false;
export const metadata = { title: "Secure payment · GadgetHub", robots: { index: false, follow: false } };
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default async function ThirdPartyPaymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const request = await prisma.paymentRequest.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    select: { amount: true, purpose: true, status: true, expiresAt: true, targetPhone: true, creditPlan: { select: { branch: { select: { name: true } } } }, sale: { select: { branch: { select: { name: true } } } } },
  });
  if (!request) notFound();
  const expired = (request.expiresAt <= new Date() && !["PROCESSING", "REVIEW"].includes(request.status)) || request.status === "EXPIRED";
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10 text-[var(--foreground)] sm:px-6">
      <section className="w-full max-w-lg overflow-hidden rounded-[26px] border border-[#8a5a12] bg-[var(--panel)] shadow-[0_22px_70px_rgb(0_0_0/.1)]">
        <div className="bg-[linear-gradient(130deg,#0a0a0a,#111111)] px-7 py-8 text-white sm:px-9">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 font-serif text-xl text-[#b7791f] ring-1 ring-white/15">G</span><div><p className="font-semibold">{request.creditPlan?.branch.name ?? request.sale?.branch.name ?? "GadgetHub"}</p><p className="text-[10px] uppercase tracking-[.18em] text-white/60">Secure payment request</p></div></div>
          <p className="mt-8 text-sm text-white/65">A GadgetHub customer has asked you to make this payment.</p>
          <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight">{money(request.amount)}</h1>
          <p className="mt-2 text-sm text-white/75">{request.purpose}</p>
        </div>
        <div className="px-7 py-7 sm:px-9 sm:py-8">
          {expired ? <div role="status" className="rounded-xl border border-[#8a5a12] bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning-text)]">This payment request has expired. Please ask the business for a new link.</div> : request.status === "PAID" ? <div role="status" className="rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-4 text-sm text-[var(--foreground)]">This payment has been received. Thank you.</div> : request.status === "REVIEW" ? <div role="status" className="rounded-xl border border-[#8a5a12] bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning-text)]">M-Pesa reported this payment, and the business is checking its account record. Please do not submit another payment. Contact the branch if you need help.</div> : <ThirdPartyPaymentForm token={token} amount={request.amount} initialStatus={request.status} initialPhone={request.targetPhone ?? ""}/>}
          <div className="mt-6 flex gap-3 border-t border-[var(--border)] pt-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--background)] text-[var(--foreground)]"><ShieldCheck className="h-4 w-4"/></span><div><p className="text-xs font-semibold text-[var(--foreground)]">Pay securely with M-Pesa</p><p className="mt-1 text-[11px] leading-5 text-[var(--foreground)]">The payer’s mobile number is prefilled for the M-Pesa prompt. GadgetHub confirms payment only after receiving verified provider confirmation. Never share your PIN.</p></div></div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-[var(--muted)]"><Clock3 className="h-3 w-3"/>Payment link expires {request.expiresAt.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}</p>
        </div>
      </section>
    </main>
  );
}
