"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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

    const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
    router.replace(callbackUrl || "/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-[#f4f5f2] text-[#17211b] lg:grid-cols-[1fr_0.8fr]">
      <section className="relative hidden overflow-hidden bg-[#173a2b] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20" aria-hidden="true" style={{ backgroundImage: "linear-gradient(135deg, transparent 47%, #c4df66 47.2%, transparent 47.5%), linear-gradient(35deg, transparent 64%, #c4df66 64.2%, transparent 64.5%)", backgroundSize: "150px 150px" }} />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center bg-[#c4df66] text-sm font-bold text-[#173a2b]">GH</div>
          <div><p className="font-semibold">GadgetHub</p><p className="text-xs text-white/60">RETAIL OPERATIONS</p></div>
        </div>
        <div className="relative max-w-xl pb-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#c4df66]">Store operations</p>
          <h1 className="text-5xl font-semibold leading-[1.05]">A clearer view of every branch.</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/70">Sales, stock and customer accounts, grounded in your live store data.</p>
        </div>
        <p className="relative text-xs text-white/50">INTERNAL BUSINESS SYSTEM</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <p className="font-semibold">GadgetHub</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#69746c]">Retail operations</p>
          </div>
          <p className="text-sm font-medium text-[#54715d]">Team access</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to your account</h2>
          <p className="mt-2 text-sm text-[#69746c]">Use your registered work email and password.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Work email</label>
              <input id="email" name="email" type="email" autoComplete="username" required className="w-full border border-[#cfd6d0] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#315d3f] focus:ring-2 focus:ring-[#315d3f]/15" />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required className="w-full border border-[#cfd6d0] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#315d3f] focus:ring-2 focus:ring-[#315d3f]/15" />
            </div>
            {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            <button type="submit" disabled={pending} className="w-full bg-[#173a2b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#24513a] disabled:cursor-wait disabled:opacity-60">
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="mt-8 border-t border-[#dfe4df] pt-5 text-xs leading-5 text-[#69746c]">Need access? Ask your branch manager to create or reactivate your account.</p>
        </div>
      </section>
    </main>
  );
}
