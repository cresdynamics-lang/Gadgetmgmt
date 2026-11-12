"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Boxes, ChartNoAxesCombined, Package, ShieldCheck } from "lucide-react";

import { hasSensitiveQuery, safeInternalPath } from "@/lib/access";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const current = new URL(window.location.href);
    const callbackUrl = current.searchParams.get("callbackUrl");
    const safeCallback = safeInternalPath(callbackUrl);
    if (!hasSensitiveQuery(current.searchParams) && (callbackUrl === null || callbackUrl === safeCallback)) return;
    const next = new URL("/login", window.location.origin);
    if (safeCallback && safeCallback !== "/login") next.searchParams.set("callbackUrl", safeCallback);
    window.history.replaceState(null, "", `${next.pathname}${next.search}`);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    setPending(false);
    if (result?.error) {
      setError("Email or password is incorrect, or this account is inactive.");
      return;
    }

    const callbackUrl = safeInternalPath(new URLSearchParams(window.location.search).get("callbackUrl"));
    router.replace(callbackUrl || "/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-[#f4f4f2] text-[#111111] lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#0a0a0a_0%,#0a7d56_58%,#0a7d56_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="pointer-events-none absolute -right-28 -top-28 h-[620px] w-[620px] rounded-full border border-white/[.07]"/><div className="pointer-events-none absolute -right-4 -top-4 h-[370px] w-[370px] rounded-full border border-white/[.08]"/><div className="pointer-events-none absolute right-20 top-24 h-52 w-52 rounded-full bg-[#0fa36e]/[.08] blur-2xl"/>
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#e5f5ee] text-[#0a0a0a] shadow-[0_8px_25px_rgb(0_0_0/.12)]"><Package className="h-5 w-5" strokeWidth={2.2}/></div>
          <div><p className="text-[16px] font-semibold tracking-[-.035em]">GadgetHub</p><p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[.2em] text-white/55">RETAIL OPERATIONS</p></div>
        </div>
        <div className="relative max-w-xl pb-12 xl:pb-20">
          <h1 className="max-w-[620px] text-[48px] font-semibold leading-[1.03] tracking-[-.055em] xl:text-[62px]">A clearer view of every branch.</h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/65">A calmer way to move through sales, stock and customer care, with your store activity all in one place.</p>
          <div className="mt-9 grid max-w-lg grid-cols-3 gap-2"><div className="rounded-2xl border border-white/[.1] bg-white/[.055] p-3"><ChartNoAxesCombined className="h-4 w-4 text-[#0fa36e]"/><p className="mt-3 text-[10px] font-medium text-white/60">Sales<br/>insight</p></div><div className="rounded-2xl border border-white/[.1] bg-white/[.055] p-3"><Boxes className="h-4 w-4 text-[#0fa36e]"/><p className="mt-3 text-[10px] font-medium text-white/60">Stock<br/>control</p></div><div className="rounded-2xl border border-white/[.1] bg-white/[.055] p-3"><ShieldCheck className="h-4 w-4 text-[#0fa36e]"/><p className="mt-3 text-[10px] font-medium text-white/60">Trusted<br/>access</p></div></div>
        </div>
        <p className="relative text-[10px] font-medium uppercase tracking-[.17em] text-white/35">A better day in every store</p>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden px-5 py-12 sm:px-10 lg:bg-[radial-gradient(ellipse_at_55%_45%,#ffffff_0%,#f4f4f2_68%,#f4f4f2_100%)]">
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full border border-[#e6e6e2] lg:block"/>
        <div className="relative w-full max-w-[410px] rounded-[24px] border border-[#e6e6e2] bg-white p-6 shadow-[0_22px_70px_rgb(0_0_0/.08)] sm:p-9">
          <div className="mb-10 lg:hidden">
            <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e5f5ee] text-[#0a7d56]"><Package className="h-4 w-4"/></span><div><p className="font-semibold tracking-tight">GadgetHub</p><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#6b6b66]">Retail operations</p></div></div>
          </div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#e5f5ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.13em] text-[#111111]"><ShieldCheck className="h-3.5 w-3.5"/>Team access</p>
          <h2 className="mt-4 text-[29px] font-semibold tracking-[-.05em] text-[#111111]">Welcome back.</h2>
          <p className="mt-2 text-sm text-[#111111]">Use your registered work email and password.</p>

          <form method="post" action="/login" className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-semibold text-[#111111]">Work email</label>
              <input id="email" name="email" type="email" autoComplete="username" required placeholder="you@company.com" className="w-full rounded-xl border border-[#e6e6e2] bg-[#ffffff] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#6b6b66] focus:border-[#6b6b66] focus:bg-white focus:ring-4 focus:ring-[#e5f5ee]" />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-semibold text-[#111111]">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" className="w-full rounded-xl border border-[#e6e6e2] bg-[#ffffff] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#6b6b66] focus:border-[#6b6b66] focus:bg-white focus:ring-4 focus:ring-[#e5f5ee]" />
            </div>
            {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0a7d56] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(0_0_0/.16)] transition hover:bg-[#0a7d56] disabled:cursor-wait disabled:opacity-60">
              {pending ? "Signing in..." : <>Sign in <ArrowRight className="h-4 w-4"/></>}
            </button>
          </form>
          <p className="mt-8 border-t border-[#e6e6e2] pt-5 text-xs leading-5 text-[#111111]">Need access? Ask your branch manager to create or reactivate your account.</p>
        </div>
      </section>
    </main>
  );
}
