"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ArrowDown, ArrowUpRight, Boxes, ChevronDown, CreditCard, LayoutDashboard, LogOut, Menu, Package, Search, Settings2, ShoppingBag, Sparkles, UserRound, UsersRound, X, BellRing, CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { navItems } from "@/lib/navigation";
import { canAccessPage } from "@/lib/access";

const iconByHref: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard,
  "/sales": ShoppingBag,
  "/inventory": Boxes,
  "/customers": UsersRound,
  "/credit": CreditCard,
  "/staff": UserRound,
  "/insights": Sparkles,
  "/notifications": BellRing,
  "/settings": Settings2,
};

function Navigation({ pathname, role, close }: { pathname: string; role: string; close?: () => void }) {
  return <nav aria-label="Main navigation" className="space-y-1.5">
    <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Workspace</p>
    {navItems.filter(({ href }) => canAccessPage(role, href)).map(({ label, href }) => {
      const Icon = iconByHref[href] ?? Package;
      const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
      return <Link key={href} href={href} onClick={close} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${active ? "bg-white text-[#12362e] shadow-[0_8px_24px_rgba(0,0,0,.15)]" : "text-white/65 hover:bg-white/[.08] hover:text-white"}`}>
        <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-[#16856d]" : "text-white/45 group-hover:text-white/80"}`} strokeWidth={1.8}/>
        <span className="flex-1">{label}</span>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-[#19a47f]"/>}
      </Link>;
    })}
  </nav>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [activeCommand, setActiveCommand] = useState(0);
  const launcherInput = useRef<HTMLInputElement>(null);
  const page = navItems.find(({ href }) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href)));
  const displayName = session?.user?.name ?? "Team member";
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const role = session?.user.role ?? "";
  const commands = useMemo(() => navItems
    .filter(({ href }) => canAccessPage(role, href))
    .map((item) => ({ ...item, keywords: `${item.label} ${item.href}`.toLowerCase() }))
    .filter((item) => item.keywords.includes(launcherQuery.trim().toLowerCase())), [role, launcherQuery]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLauncherOpen((open) => !open);
        setLauncherQuery("");
        setActiveCommand(0);
      } else if (event.key === "Escape") {
        setLauncherOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!launcherOpen) return;
    setActiveCommand(0);
    const frame = window.requestAnimationFrame(() => launcherInput.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [launcherOpen, launcherQuery]);

  function chooseCommand(href: string) {
    setLauncherOpen(false);
    setLauncherQuery("");
    router.push(href);
  }

  return <div className="min-h-screen bg-[#f5f4ee] text-[#202820] lg:p-3">
    <div className="mx-auto flex min-h-screen max-w-[1800px] overflow-hidden bg-[#fffefa] shadow-[0_12px_45px_rgba(38,42,31,.07)] lg:min-h-[calc(100vh-24px)] lg:rounded-[20px] lg:border lg:border-[#e9e6dc]">
      {menuOpen && <div className="fixed inset-0 z-50 flex"><button aria-label="Close navigation" className="absolute inset-0 bg-[#071a16]/55 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)}/><aside className="relative flex h-full w-[290px] max-w-[85vw] flex-col justify-between bg-[#102d27] p-4 text-white shadow-2xl"><div><div className="mb-8 flex items-center justify-between px-2"><Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#c7f2df] text-[#12362e]"><Package className="h-5 w-5"/></span><span className="text-base font-semibold">GadgetHub</span></Link><button onClick={() => setMenuOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4"/></button></div><Navigation pathname={pathname} role={role} close={() => setMenuOpen(false)}/></div><div className="flex items-center justify-between border-t border-white/10 px-2 pt-4"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white/80">{displayName}</p><p className="mt-1 truncate text-[10px] text-white/45">{session?.user.branchName ?? "No branch assigned"}</p></div><button onClick={() => void signOut({ redirectTo: "/login" })} title="Sign out" aria-label={`Sign out ${displayName}`} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4"/></button></div></aside></div>}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-[#edf1ee] bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-9">
          <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e9eeea] bg-white text-[#52665c] shadow-sm transition hover:bg-[#f4f8f5]"><Menu className="h-[18px] w-[18px]"/></button><div className="min-w-0"><div className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#94a39a] sm:flex"><span>GadgetHub</span><span className="text-[#c6d0c9]">/</span><span className="text-[#5c796b]">Operations</span></div><h1 className="truncate text-[19px] font-semibold tracking-[-.035em] text-[#1b2c24] sm:mt-1 sm:text-[21px]">{page?.label ?? "Dashboard"}</h1></div></div>
          <div className="flex items-center gap-2 sm:gap-3"><button type="button" onClick={() => { setLauncherOpen(true); setLauncherQuery(""); }} aria-label="Open quick navigation" className="flex h-9 items-center gap-2 rounded-xl border border-[#e8eeea] bg-[#fbfcfa] px-2.5 text-[#68786e] transition hover:border-[#cddbd0] hover:bg-[#f4f8f5] sm:px-3"><Search className="h-3.5 w-3.5"/><span className="hidden text-[11px] font-medium sm:inline">Jump to anything</span><kbd className="hidden rounded-md border border-[#e1e8e2] bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#87938a] sm:inline">Ctrl K</kbd></button><div className="hidden items-center gap-2 rounded-full border border-[#e8eeea] bg-[#f8faf8] px-3 py-2 text-[11px] font-medium text-[#53685d] md:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#19a47f]"/>{session?.user.branchName ?? (role === "OWNER" ? "All branches" : "Branch not assigned")}</div><div className="hidden h-8 w-px bg-[#e9eeea] sm:block"/><div className="flex items-center gap-2 sm:hidden"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f4ed] text-[11px] font-bold text-[#315e48]">{initials}</span></div><button type="button" onClick={() => void signOut({ redirectTo: "/login" })} className="hidden items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-[#f5f8f6] sm:flex"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f4ed] text-[11px] font-bold text-[#315e48]">{initials}</span><span className="hidden max-w-28 truncate text-xs font-semibold text-[#344a3e] xl:block">{displayName}</span><ChevronDown className="h-3.5 w-3.5 text-[#95a39a]"/></button></div>
        </header>
        <div className="workspace-content flex-1 px-4 py-6 sm:px-6 sm:py-7 lg:px-9 lg:py-8">{children}</div>
        <footer className="flex items-center justify-between border-t border-[#edf1ee] px-4 py-3.5 text-[10px] text-[#99a69e] sm:px-6 lg:px-9"><span>GadgetHub · Retail operations</span><span className="flex items-center gap-1.5">A clearer view of every day <ArrowUpRight className="h-3 w-3"/></span></footer>
      </main>
    </div>
    {launcherOpen ? <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[#0b201b]/45 px-4 pt-[12vh] backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setLauncherOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Quick navigation" className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#e5ebe5] bg-[#fffefa] shadow-[0_28px_100px_rgba(11,32,27,.28)]">
        <div className="flex items-center gap-3 border-b border-[#edf0eb] px-4"><Search className="h-4 w-4 shrink-0 text-[#819087]"/><input ref={launcherInput} value={launcherQuery} onChange={(event) => setLauncherQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActiveCommand((index) => Math.min(index + 1, commands.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveCommand((index) => Math.max(index - 1, 0)); } else if (event.key === "Enter" && commands[activeCommand]) { event.preventDefault(); chooseCommand(commands[activeCommand].href); } }} placeholder="Search a page or workflow..." aria-label="Search pages and workflows" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-[#263a30] outline-none placeholder:text-[#a1aaa2]"/><kbd className="rounded-md border border-[#e5e9e4] bg-[#f8f9f6] px-1.5 py-1 text-[9px] text-[#8a958c]">ESC</kbd></div>
        <div className="max-h-[min(56vh,440px)] overflow-y-auto p-2" role="listbox" aria-label="Available destinations">{commands.length ? commands.map((command, index) => { const Icon = iconByHref[command.href] ?? Package; return <button key={command.href} type="button" role="option" aria-selected={activeCommand === index} onMouseEnter={() => setActiveCommand(index)} onClick={() => chooseCommand(command.href)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${activeCommand === index ? "bg-[#edf5ee] text-[#234936]" : "text-[#53635a] hover:bg-[#f6f8f4]"}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${activeCommand === index ? "bg-white text-[#317351]" : "bg-[#f3f5f0] text-[#829087]"}`}><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{command.label}</span><span className="mt-0.5 block truncate text-[10px] text-[#94a096]">Open {command.label.toLowerCase()}</span></span>{activeCommand === index ? <CornerDownLeft className="h-3.5 w-3.5 text-[#789181]"/> : null}</button>; }) : <p className="px-3 py-9 text-center text-sm text-[#87938a]">No matching page. Try “sales”, “stock”, “customers” or “insights”.</p>}</div>
        <div className="flex items-center justify-between border-t border-[#edf0eb] bg-[#fafbf8] px-4 py-2.5 text-[9px] text-[#98a198]"><span>Quick navigation · destinations follow your access role</span><span className="flex items-center gap-2"><span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3"/>Open</span><span className="inline-flex items-center gap-1"><ArrowDown className="h-3 w-3"/>Move</span></span></div>
      </section>
    </div> : null}
  </div>;
}

export function SearchField({ placeholder = "Search..." }: { placeholder?: string }) {
  return <label className="flex items-center gap-2 rounded-xl border border-[#e5ece7] bg-white px-3 py-2 text-sm text-[#718078] shadow-sm transition focus-within:border-[#8ebba2] focus-within:ring-4 focus-within:ring-[#dcefe3]"><Search className="h-4 w-4"/><input aria-label="Search" className="w-full border-0 bg-transparent text-sm text-[#17251e] placeholder:text-[#a2aea7] focus:outline-none" placeholder={placeholder}/></label>;
}
