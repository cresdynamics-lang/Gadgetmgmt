"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Boxes, ChartNoAxesCombined, ShieldCheck } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";

const SAMPLE_OWNER = {
  email: "gadgethub@gmail.co",
  password: "GadgetHubOwner1",
};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? email),
      password: String(formData.get("password") ?? password),
      redirect: false,
    });

    setPending(false);
    if (result?.error) {
      setError("Email or password is incorrect, or this account is inactive.");
      return;
    }

    const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
    router.replace(callbackUrl || "/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-[#f5f5f5] text-[#111111] lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#111111_0%,#1a1a1a_58%,#000000_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="pointer-events-none absolute -right-28 -top-28 h-[620px] w-[620px] rounded-full border border-white/[.07]"/><div className="pointer-events-none absolute -right-4 -top-4 h-[370px] w-[370px] rounded-full border border-white/[.08]"/><div className="pointer-events-none absolute right-20 top-24 h-52 w-52 rounded-full bg-[#a3a3a3]/[.08] blur-2xl"/>
        <div className="relative">
          <BrandLogo variant="logo" on="dark" className="h-24 w-auto" />
          <p className="mt-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/55">Retail operations</p>
        </div>
        <div className="relative max-w-xl pb-12 xl:pb-20">
          <h1 className="max-w-[620px] text-[48px] font-semibold leading-[1.03] tracking-[-.055em] xl:text-[62px]">A clearer view of every branch.</h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/65">A calmer way to move through sales, stock and customer care, with your store activity all in one place.</p>
          <div className="mt-9 grid max-w-lg grid-cols-3 gap-2"><div className="rounded-2xl border border-white/[.1] bg-white/[.055] p-3"><ChartNoAxesCombined className="h-4 w-4 text-[#a3a3a3]"/><p className="mt-3 text-[10px] font-medium text-white/60">Sales<br/>insight</p></div><div className="rounded-2xl border border-white/[.1] bg-white/[.055] p-3"><Boxes className="h-4 w-4 text-[#a3a3a3]"/><p className="mt-3 text-[10px] font-medium text-white/60">Stock<br/>control</p></div><div className="rounded-2xl border border-white/[.1] bg-white/[.055] p-3"><ShieldCheck className="h-4 w-4 text-[#a3a3a3]"/><p className="mt-3 text-[10px] font-medium text-white/60">Trusted<br/>access</p></div></div>
        </div>
        <p className="relative text-[10px] font-medium uppercase tracking-[.17em] text-white/35">A better day in every store</p>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden px-5 py-12 sm:px-10 lg:bg-[radial-gradient(ellipse_at_55%_45%,#ffffff_0%,#f5f5f5_68%,#eeeeee_100%)]">
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full border border-[#e5e5e5] lg:block"/>
        <div className="relative w-full max-w-[410px] rounded-[24px] border border-[#e5e5e5] bg-white p-6 shadow-[0_22px_70px_rgba(0,0,0,.08)] sm:p-9">
          <div className="mb-10 lg:hidden">
            <div className="flex items-center gap-2.5"><BrandLogo variant="icon" on="dark" className="h-9 w-9 rounded-xl" /><div><p className="font-semibold tracking-tight">GadgetHub</p><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#6b6b6b]">Retail operations</p></div></div>
          </div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.13em] text-[#4a4a4a]"><ShieldCheck className="h-3.5 w-3.5"/>Team access</p>
          <h2 className="mt-4 text-[29px] font-semibold tracking-[-.05em] text-[#111111]">Welcome back.</h2>
          <p className="mt-2 text-sm text-[#6b6b6b]">Use your registered work email and password.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-semibold text-[#2d2d2d]">Work email</label>
              <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#a3a3a3] focus:border-black focus:bg-white focus:ring-4 focus:ring-black/10" />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-semibold text-[#2d2d2d]">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="w-full rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#a3a3a3] focus:border-black focus:bg-white focus:ring-4 focus:ring-black/10" />
            </div>
            {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,.16)] transition hover:bg-[#1a1a1a] disabled:cursor-wait disabled:opacity-60">
              {pending ? "Signing in..." : <>Sign in <ArrowRight className="h-4 w-4"/></>}
            </button>
          </form>
          <div className="mt-8 border-t border-[#e5e5e5] pt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#6b6b6b]">Sample owner login</p>
            <button type="button" onClick={() => { setEmail(SAMPLE_OWNER.email); setPassword(SAMPLE_OWNER.password); setError(""); }} className="mt-3 flex w-full items-start justify-between gap-3 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-3.5 py-3 text-left transition hover:border-black hover:bg-white">
              <span>
                <span className="block text-xs font-semibold text-[#111111]">Super admin · Owner</span>
                <span className="mt-1 block text-[11px] text-[#6b6b6b]">{SAMPLE_OWNER.email}</span>
                <span className="mt-0.5 block text-[11px] text-[#6b6b6b]">Password · {SAMPLE_OWNER.password}</span>
              </span>
              <span className="shrink-0 text-[11px] font-semibold text-[#111111]">Use</span>
            </button>
            <p className="mt-3 text-xs leading-5 text-[#6b6b6b]">Need another account? Ask your branch manager to create or reactivate it.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
