"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Activity, ArrowDown, ChartNoAxesCombined, ArrowUpRight, Boxes, ChevronDown, CreditCard, Globe, LayoutDashboard, LogOut, Menu, Package, Search, Settings2, ShoppingBag, Sparkles, UserRound, UsersRound, X, BellRing, CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { navItems } from "@/lib/navigation";
import { canAccessPage, hasPermission, type AccessSubject } from "@/lib/access";
import { ApprovalGate } from "@/components/approval-gate";
import { AssistantDock } from "@/components/assistant-dock";
import { BrandLogo } from "@/components/brand-logo";

const iconByHref: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard,
  "/sales": ShoppingBag,
  "/reports": ChartNoAxesCombined,
  "/inventory": Boxes,
  "/website": Globe,
  "/customers": UsersRound,
  "/credit": CreditCard,
  "/staff": UserRound,
  "/activity": Activity,
  "/insights": Sparkles,
  "/notifications": BellRing,
  "/settings": Settings2,
};

function Navigation({ pathname, user, close }: { pathname: string; user: AccessSubject; close?: () => void }) {
  return <nav aria-label="Main navigation" className="space-y-1.5">
    <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Workspace</p>
    {navItems.filter(({ href }) => canAccessPage(user, href)).map(({ label, href }) => {
      const Icon = iconByHref[href] ?? Package;
      const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
      return <Link key={href} href={href} onClick={close} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${active ? "bg-white text-[#111111] shadow-[0_8px_24px_rgba(0,0,0,.15)]" : "text-white/65 hover:bg-white/[.08] hover:text-white"}`}>
        <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-[#2d2d2d]" : "text-white/45 group-hover:text-white/80"}`} strokeWidth={1.8}/>
        <span className="flex-1">{label}</span>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-[#2d2d2d]"/>}
      </Link>;
    })}
  </nav>;
}

function SidebarBody({ pathname, user, displayName, branchName, onLeave, close }: { pathname: string; user: AccessSubject; displayName: string; branchName: string; onLeave: () => void; close?: () => void }) {
  return <>
    <div className="min-h-0 flex-1">
      <div className="mb-7 flex items-center justify-between px-2">
        <Link href="/dashboard" onClick={close} className="flex items-center gap-3"><BrandLogo variant="icon" on="light" className="h-10 w-10 rounded-xl" /><span className="text-base font-semibold">GadgetHub</span></Link>
        {close ? <button onClick={close} aria-label="Close navigation" className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4"/></button> : null}
      </div>
      <Navigation pathname={pathname} user={user} close={close}/>
    </div>
    <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 px-2 pt-4">
      <div className="min-w-0"><p className="truncate text-xs font-semibold text-white/80">{displayName}</p><p className="mt-1 truncate text-[10px] text-white/45">{branchName}</p></div>
      <button onClick={onLeave} title="Sign out" aria-label={`Sign out ${displayName}`} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4"/></button>
    </div>
  </>;
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
    .filter(({ href }) => canAccessPage(session?.user, href))
    .map((item) => ({ ...item, keywords: `${item.label} ${item.href}`.toLowerCase() }))
    .filter((item) => item.keywords.includes(launcherQuery.trim().toLowerCase())), [session?.user, launcherQuery]);

  useEffect(() => {
    if (!session?.user.id) return;
    const source = new EventSource("/api/realtime");
    const refresh = () => {
      router.refresh();
      window.dispatchEvent(new Event("gadgethub:live"));
    };
    source.onmessage = refresh;
    const onOnline = () => { if (navigator.onLine) refresh(); };
    window.addEventListener("online", onOnline);
    const visibility = () => { if (document.visibilityState === "visible" && navigator.onLine) refresh(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      source.close();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [router, session?.user.id]);

  useEffect(() => {
    if (!session?.user.accessUntil) return;
    const ends = new Date(session.user.accessUntil).getTime();
    if (!Number.isFinite(ends)) return;
    const leaveWhenDone = () => {
      if (Date.now() >= ends) void leave();
    };
    leaveWhenDone();
    const timer = window.setInterval(leaveWhenDone, 1000);
    return () => window.clearInterval(timer);
  }, [session?.user.accessUntil]);

  useEffect(() => {
    if (!session?.user.sessionId) return;
    const ping = (end = false) => void fetch("/api/activity/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end }),
      keepalive: end,
    });
    ping();
    const timer = window.setInterval(() => ping(), 60_000);
    return () => window.clearInterval(timer);
  }, [session?.user.sessionId]);

  async function leave() {
    if (session?.user.sessionId) {
      await fetch("/api/activity/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end: true }),
        keepalive: true,
      });
    }
    await signOut({ redirectTo: "/login" });
  }

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
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!launcherOpen) return;
    const frame = window.requestAnimationFrame(() => launcherInput.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [launcherOpen, launcherQuery]);

  function chooseCommand(href: string) {
    setLauncherOpen(false);
    setLauncherQuery("");
    router.push(href);
  }

  return <div className="min-h-screen bg-[#f5f5f5] text-[#111111] lg:p-3">
    <ApprovalGate/>
    {hasPermission(session?.user, "assistant.use") ? <AssistantDock/> : null}
    <div className="mx-auto flex min-h-screen max-w-[1800px] overflow-clip bg-white shadow-[0_12px_45px_rgba(0,0,0,.07)] lg:min-h-[calc(100vh-24px)] lg:rounded-[20px] lg:border lg:border-[#e5e5e5]">
      {/* Desktop: the sidebar is always visible. Phones and tablets open it from the menu button. */}
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col overflow-y-auto bg-[#111111] p-4 text-white lg:top-3 lg:flex lg:h-[calc(100vh-24px)] xl:w-[264px]">
        <SidebarBody pathname={pathname} user={session?.user} displayName={displayName} branchName={session?.user.branchName ?? "No branch assigned"} onLeave={() => void leave()}/>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-[#111111]/55 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)}/><aside className="relative flex h-full w-[290px] max-w-[85vw] flex-col overflow-y-auto bg-[#111111] p-4 text-white shadow-2xl"><SidebarBody pathname={pathname} user={session?.user} displayName={displayName} branchName={session?.user.branchName ?? "No branch assigned"} onLeave={() => void leave()} close={() => setMenuOpen(false)}/></aside></div>}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-[var(--border)] bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-9">
          <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl lg:hidden border border-[#e5e5e5] bg-white text-[#2d2d2d] shadow-sm transition hover:bg-[#f5f5f5]"><Menu className="h-[18px] w-[18px]"/></button><div className="min-w-0"><div className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#6b6b6b] sm:flex"><BrandLogo variant="icon" on="dark" className="h-4 w-4 rounded-sm" /><span>GadgetHub</span><span className="text-[#c4c4c4]">/</span><span className="text-[#111111]">Operations</span></div><h1 className="truncate text-[19px] font-semibold tracking-[-.035em] text-[#111111] sm:mt-1 sm:text-[21px]">{page?.label ?? "Dashboard"}</h1></div></div>
          <div className="flex items-center gap-2 sm:gap-3"><button type="button" onClick={() => { setActiveCommand(0); setLauncherOpen(true); setLauncherQuery(""); }} aria-label="Open quick navigation" className="flex h-9 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-2.5 text-[#59616e] transition hover:border-[var(--signal)] hover:bg-[#f8f9ff] sm:px-3"><Search className="h-3.5 w-3.5"/><span className="hidden text-[11px] font-medium sm:inline">Jump to anything</span><kbd className="hidden rounded-md border border-[var(--border)] bg-[#f7f8fa] px-1.5 py-0.5 text-[9px] font-semibold text-[#737983] sm:inline">⌘ K</kbd></button><div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[#f8f9fb] px-3 py-2 text-[11px] font-medium text-[#59616e] md:flex"><span className="h-1.5 w-1.5 rounded-full bg-[var(--signal)]"/>{session?.user.branchName ?? (role === "OWNER" ? "All branches" : "Branch not assigned")}</div><div className="hidden h-8 w-px bg-[var(--border)] sm:block"/><div className="flex items-center gap-2 sm:hidden"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)]">{initials}</span></div><button type="button" onClick={() => void leave()} className="hidden items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-[#f5f6f8] sm:flex"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)]">{initials}</span><span className="hidden max-w-28 truncate text-xs font-semibold text-[#343941] xl:block">{displayName}</span><ChevronDown className="h-3.5 w-3.5 text-[#95a39a]"/></button></div>
        </header>
        {session?.user.accessUntil ? <p className="border-b border-[#f3e2d6] bg-[#fff8f3] px-4 py-2 text-center text-xs text-[#8a4b2f]">Approved access ends at {new Date(session.user.accessUntil).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}. You will be signed out then.</p> : null}
        <div className="workspace-content flex-1 px-4 py-6 sm:px-6 sm:py-7 lg:px-9 lg:py-8">{children}</div>
        <footer className="flex items-center justify-between border-t border-[#e5e5e5] px-4 py-3.5 text-[10px] text-[#6b6b6b] sm:px-6 lg:px-9"><span className="inline-flex items-center gap-2"><BrandLogo variant="icon" on="dark" className="h-4 w-4 rounded-sm" />GadgetHub · Retail operations</span><span className="flex items-center gap-1.5">A clearer view of every day <ArrowUpRight className="h-3 w-3"/></span></footer>
      </main>
    </div>
    {launcherOpen ? <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[#111111]/45 px-4 pt-[12vh] backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setLauncherOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Quick navigation" className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_28px_100px_rgba(0,0,0,.28)]">
        <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-4"><Search className="h-4 w-4 shrink-0 text-[#819087]"/><input ref={launcherInput} value={launcherQuery} onChange={(event) => setLauncherQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActiveCommand((index) => Math.min(index + 1, commands.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveCommand((index) => Math.max(index - 1, 0)); } else if (event.key === "Enter" && commands[activeCommand]) { event.preventDefault(); chooseCommand(commands[activeCommand].href); } }} placeholder="Search a page or workflow..." aria-label="Search pages and workflows" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-[#111111] outline-none placeholder:text-[#a1aaa2]"/><kbd className="rounded-md border border-[#e5e5e5] bg-[#f5f5f5] px-1.5 py-1 text-[9px] text-[#8a958c]">ESC</kbd></div>
        <div className="max-h-[min(56vh,440px)] overflow-y-auto p-2" role="listbox" aria-label="Available destinations">{commands.length ? commands.map((command, index) => { const Icon = iconByHref[command.href] ?? Package; return <button key={command.href} type="button" role="option" aria-selected={activeCommand === index} onMouseEnter={() => setActiveCommand(index)} onClick={() => chooseCommand(command.href)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${activeCommand === index ? "bg-[#f5f5f5] text-[#1a1a1a]" : "text-[#2d2d2d] hover:bg-[#f5f5f5]"}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${activeCommand === index ? "bg-white text-[#2d2d2d]" : "bg-[#f5f5f5] text-[#829087]"}`}><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{command.label}</span><span className="mt-0.5 block truncate text-[10px] text-[#94a096]">Open {command.label.toLowerCase()}</span></span>{activeCommand === index ? <CornerDownLeft className="h-3.5 w-3.5 text-[#6b6b6b]"/> : null}</button>; }) : <p className="px-3 py-9 text-center text-sm text-[#87938a]">No matching page. Try “sales”, “stock”, “customers” or “insights”.</p>}</div>
        <div className="flex items-center justify-between border-t border-[#e5e5e5] bg-[#f5f5f5] px-4 py-2.5 text-[9px] text-[#98a198]"><span>Quick navigation · destinations follow your access role</span><span className="flex items-center gap-2"><span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3"/>Open</span><span className="inline-flex items-center gap-1"><ArrowDown className="h-3 w-3"/>Move</span></span></div>
      </section>
    </div> : null}
  </div>;
}

export function SearchField({ placeholder = "Search..." }: { placeholder?: string }) {
  return <label className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#718078] shadow-sm transition focus-within:border-[#a3a3a3] focus-within:ring-4 focus-within:ring-[#e5e5e5]"><Search className="h-4 w-4"/><input aria-label="Search" className="w-full border-0 bg-transparent text-sm text-[#111111] placeholder:text-[#a2aea7] focus:outline-none" placeholder={placeholder}/></label>;
}
