"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Activity, ArrowDown, ArrowUpRight, BellRing, Boxes, ClipboardList, CornerDownLeft, CreditCard, Handshake, Landmark, LayoutDashboard, LogOut, Menu, MoreHorizontal, Package, Receipt, ScrollText, Search, Settings2, ShieldCheck, ShoppingBag, Smartphone, Sparkles, Star, Truck, UserRound, UsersRound, Wallet, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { NotificationBell } from "@/components/notification-bell";
import { navItems } from "@/lib/navigation";
import { canAccessPage, sessionGrants, type AccessMap } from "@/lib/access";

const primaryTabOrder: Record<string, string[]> = {
  OWNER: ["/dashboard", "/sales", "/inventory", "/notifications"],
  BRANCH_MANAGER: ["/dashboard", "/sales", "/inventory", "/credit"],
  CASHIER: ["/dashboard", "/sales", "/credit", "/customers"],
  INVENTORY_LEAD: ["/dashboard", "/inventory", "/notifications"],
};

const primaryTabLabel: Record<string, string> = {
  "/dashboard": "Today",
  "/sales": "Sell",
  "/inventory": "Stock",
  "/credit": "Lipa",
  "/customers": "Clients",
  "/notifications": "Alerts",
};

const iconByHref: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard,
  "/sales": ShoppingBag,
  "/deliveries": Truck,
  "/inventory": Boxes,
  "/planner": ClipboardList,
  "/devices": Smartphone,
  "/repairs": Wrench,
  "/partners": Handshake,
  "/customers": UsersRound,
  "/credit": CreditCard,
  "/layaway": Wallet,
  "/finance": Landmark,
  "/expenses": Receipt,
  "/performance": Star,
  "/assistant": Sparkles,
  "/insights": Activity,
  "/staff": UserRound,
  "/activity": ScrollText,
  "/notifications": BellRing,
  "/settings": Settings2,
  "/access": ShieldCheck,
};

function Navigation({ pathname, role, grants, close }: { pathname: string; role: string; grants?: AccessMap; close?: () => void }) {
  return <nav aria-label="Main navigation" className="space-y-1.5">
    <Link href="/account" onClick={close} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-[#c9c9c4] hover:bg-[#1a1a19]"><ShieldCheck size={18} aria-hidden="true"/>Account security</Link>
    <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a8a85]">Workspace</p>
    {navItems.filter(({ href }) => canAccessPage(role, href, grants)).map(({ label, href }) => {
      const Icon = iconByHref[href] ?? Package;
      const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
      return <Link key={href} href={href} onClick={close} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 ${active ? "bg-[#1f1f1e] text-white" : "text-[#c9c9c4] hover:bg-[#1a1a19] hover:text-white"}`}>
        <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-[var(--accent-text)]" : "text-[#8a8a85] group-hover:text-white"}`} strokeWidth={1.8}/>
        <span className="flex-1">{label}</span>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-[#0fa36e]"/>}
      </Link>;
    })}
  </nav>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [screenLocked, setScreenLocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [activeCommand, setActiveCommand] = useState(0);
  const menuDialog = useRef<HTMLDivElement>(null);
  const launcherInput = useRef<HTMLInputElement>(null);
  const page = navItems.find(({ href }) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href)));
  const role = session?.user.role ?? "";
  const displayName = role === "OWNER" ? "Administrator" : session?.user?.name ?? "Team member";
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const grants = sessionGrants(role, session?.user.pages, session?.user.capabilities);
  const primaryTabs = (primaryTabOrder[role] ?? primaryTabOrder.OWNER).filter((href) => canAccessPage(role, href, grants));
  const launcherNeedle = launcherQuery.trim().toLowerCase();
  const commands = navItems
    .filter(({ href }) => canAccessPage(role, href, grants))
    .map((item) => ({ ...item, keywords: `${item.label} ${item.href}`.toLowerCase() }))
    .filter((item) => item.keywords.includes(launcherNeedle));

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
    const frame = window.requestAnimationFrame(() => launcherInput.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [launcherOpen, launcherQuery]);

  useEffect(() => {
    let locked = false;
    const lock = () => {
      locked = true; setScreenLocked(true);
      try { sessionStorage.setItem("gadgethub-lock-pending", "1"); } catch {}
      navigator.sendBeacon("/api/auth/lock", new Blob(["{}"], { type: "application/json" }));
    };
    const heartbeat = async () => {
      if (locked || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const response = await fetch("/api/auth/heartbeat", { method: "POST", signal: AbortSignal.timeout(8000) });
        if (response.status === 401) { setScreenLocked(true); window.location.replace("/login"); }
      } catch { /* A missed lease never silently renews authorization. */ }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") lock();
      else if (locked) window.location.replace(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    };
    queueMicrotask(()=>{try { if (sessionStorage.getItem("gadgethub-lock-pending")) { lock(); window.location.replace("/login"); } } catch {}});
    document.addEventListener("visibilitychange", visibility);
    const interval = window.setInterval(()=>void heartbeat(), 25000);
    void Promise.resolve().then(heartbeat);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => menuDialog.current?.querySelector<HTMLElement>("button, a")?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = menuDialog.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [menuOpen]);

  useEffect(()=>{
    if(!launcherOpen)return;
    const previous=document.activeElement as HTMLElement|null;
    const key=(event:KeyboardEvent)=>{
      if(event.key!=="Tab")return;
      const dialog=launcherInput.current?.closest("[role=dialog]");
      const items=dialog?.querySelectorAll<HTMLElement>("input,button:not([disabled]),a[href]");
      if(!items?.length)return;
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",key);
    return()=>{document.removeEventListener("keydown",key);previous?.focus();};
  },[launcherOpen]);

  function chooseCommand(href: string) {
    setLauncherOpen(false);
    setLauncherQuery("");
    router.push(href);
  }

  if (screenLocked) return <div className="security-root"><div className="security-login security-stack"><ShieldCheck aria-hidden="true"/><h1>Workspace locked</h1><p>Sign in again to return to your work.</p><Link className="security-primary" href="/login">Unlock workspace</Link></div></div>;

  return <div className="fixed inset-0 flex overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <aside className="side-nav hidden h-full w-[248px] shrink-0 flex-col bg-[#0a0a0a] p-4 text-white lg:flex">
        <div className="shrink-0">
          <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2"><Image src="/brand/icon-black.png" alt="" width={40} height={40} className="shrink-0 rounded-xl" unoptimized/><span className="text-base font-semibold text-white">GadgetHub</span></Link>
        </div>
        <div className="side-nav-links min-h-0 flex-1 overflow-y-auto">
          <Navigation pathname={pathname} role={role} grants={grants}/>
        </div>
        <div className="mt-4 flex shrink-0 items-center justify-between border-t border-white/10 px-2 pt-4">
          <div className="min-w-0"><p className="truncate text-xs font-semibold text-white/80">{displayName}</p><p className="mt-1 truncate text-[10px] text-white/45">{session?.user.branchName ?? "No branch assigned"}</p></div>
          <button type="button" onClick={() => void signOut({ redirectTo: "/login" })} aria-label={`Sign out ${displayName}`} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4"/></button>
        </div>
      </aside>
      {menuOpen && <div ref={menuDialog} role="dialog" aria-modal="true" aria-label="Navigation" className="fixed inset-0 z-50 flex"><button aria-label="Close navigation" className="absolute inset-0 bg-[#0a0a0a]/55 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)}/><aside className="relative flex h-full max-h-[100dvh] w-[290px] max-w-[85vw] flex-col bg-[#0a0a0a] p-4 text-white shadow-2xl"><div className="mb-8 flex shrink-0 items-center justify-between px-2"><Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3"><Image src="/brand/icon-black.png" alt="" width={40} height={40} className="shrink-0 rounded-xl" unoptimized/><span className="text-base font-semibold text-white">GadgetHub</span></Link><button onClick={() => setMenuOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4"/></button></div><div className="side-nav-links min-h-0 flex-1"><Navigation pathname={pathname} role={role} grants={grants} close={() => setMenuOpen(false)}/></div><div className="mt-4 flex shrink-0 items-center justify-between border-t border-white/10 px-2 pt-4"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white/80">{displayName}</p><p className="mt-1 truncate text-[10px] text-white/45">{session?.user.branchName ?? "No branch assigned"}</p></div><button onClick={() => void signOut({ redirectTo: "/login" })} title="Sign out" aria-label={`Sign out ${displayName}`} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4"/></button></div></aside></div>}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-20 flex min-h-[76px] shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--panel)] px-4 sm:px-6 lg:px-9">
          <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] shadow-sm transition hover:bg-[var(--background)] lg:hidden"><Menu className="h-[18px] w-[18px]"/></button><div className="min-w-0"><div className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--muted)] sm:flex"><span>GadgetHub</span><span className="text-[var(--muted)]">/</span><span className="text-[var(--foreground)]">Operations</span></div><h1 className="truncate text-[19px] font-semibold tracking-[-.035em] text-[var(--foreground)] sm:mt-1 sm:text-[21px]">{page?.label ?? (pathname === "/account" ? "Account security" : "Dashboard")}</h1></div></div>
          <div className="flex items-center gap-2 sm:gap-3">{canAccessPage(role,"/notifications",grants)&&<NotificationBell />}<button type="button" onClick={() => { setActiveCommand(0); setLauncherOpen(true); setLauncherQuery(""); }} aria-label="Open quick navigation" className="flex h-9 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-2.5 text-[var(--foreground)] transition hover:border-[var(--signal)] hover:bg-[var(--panel)] sm:px-3"><Search className="h-3.5 w-3.5"/><span className="hidden text-[11px] font-medium sm:inline">Jump to anything</span><kbd className="hidden rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--foreground)] sm:inline">⌘ K</kbd></button><div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[11px] font-medium text-[var(--foreground)] md:flex"><span className="h-1.5 w-1.5 rounded-full bg-[var(--signal)]"/>{session?.user.branchName ?? (role === "OWNER" ? "All branches" : "Branch not assigned")}</div><div className="hidden h-8 w-px bg-[var(--border)] sm:block"/><div className="flex items-center gap-2 sm:hidden"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent-text)]">{initials}</span></div><div className="hidden items-center gap-2 sm:flex"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent-text)]">{initials}</span><span className="hidden max-w-28 truncate text-xs font-semibold text-[var(--foreground)] xl:block">{displayName}</span><button type="button" onClick={() => void signOut({ redirectTo: "/login" })} aria-label={`Sign out ${displayName}`} className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--background)]"><LogOut className="h-3.5 w-3.5"/>Sign out</button></div></div>
        </header>
        <div tabIndex={0} role="region" aria-label="Workspace content" className="app-scroll min-h-0 flex-1 overflow-y-auto pb-[4.75rem] lg:pb-0">
          <div className="workspace-content px-4 py-6 sm:px-6 sm:py-7 lg:px-9 lg:py-8">{children}</div>
          <footer className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3.5 text-[10px] text-[var(--muted)] sm:px-6 lg:px-9"><span>GadgetHub · Retail operations</span><span className="flex items-center gap-1.5">A clearer view of every day <ArrowUpRight className="h-3 w-3"/></span></footer>
        </div>
      </main>
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--border)] bg-[var(--panel)] px-1 pt-1 lg:hidden" style={{ paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}>
      {primaryTabs.map((href) => {
        const Icon = iconByHref[href] ?? Package;
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold ${active ? "text-[var(--accent-text)]" : "text-[var(--muted)]"}`}><Icon className="h-4 w-4" strokeWidth={1.8}/>{primaryTabLabel[href] ?? "Open"}</Link>;
      })}
      <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-[var(--muted)]"><MoreHorizontal className="h-4 w-4"/>More</button>
    </nav>
    {launcherOpen ? <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[#0a0a0a]/45 px-4 pt-[12vh] backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setLauncherOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Quick navigation" className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_28px_100px_rgb(0_0_0/.28)]">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4"><Search className="h-4 w-4 shrink-0 text-[var(--muted)]"/><input ref={launcherInput} value={launcherQuery} onChange={(event) => {setLauncherQuery(event.target.value);setActiveCommand(0);}} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActiveCommand((index) => Math.min(index + 1, commands.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveCommand((index) => Math.max(index - 1, 0)); } else if (event.key === "Enter" && commands[activeCommand]) { event.preventDefault(); chooseCommand(commands[activeCommand].href); } }} placeholder="Search a page or workflow..." aria-label="Search pages and workflows" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"/><button type="button" className="security-link" onClick={()=>setLauncherOpen(false)} aria-label="Close quick navigation">Close</button></div>
        <div className="max-h-[min(56vh,440px)] overflow-y-auto p-2" role="listbox" aria-label="Available destinations">{commands.length ? commands.map((command, index) => { const Icon = iconByHref[command.href] ?? Package; return <button key={command.href} type="button" role="option" aria-selected={activeCommand === index} onMouseEnter={() => setActiveCommand(index)} onClick={() => chooseCommand(command.href)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${activeCommand === index ? "bg-[var(--background)] text-[var(--accent-text)]" : "text-[var(--foreground)] hover:bg-[var(--background)]"}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${activeCommand === index ? "bg-[var(--panel)] text-[var(--accent-text)]" : "bg-[var(--background)] text-[var(--muted)]"}`}><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{command.label}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">Open {command.label.toLowerCase()}</span></span>{activeCommand === index ? <CornerDownLeft className="h-3.5 w-3.5 text-[var(--muted)]"/> : null}</button>; }) : <p className="px-3 py-9 text-center text-sm text-[var(--muted)]">No matching page. Try “sales”, “stock”, “customers” or “insights”.</p>}</div>
        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-[9px] text-[var(--muted)]"><span>Quick navigation · destinations follow your access role</span><span className="flex items-center gap-2"><span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3"/>Open</span><span className="inline-flex items-center gap-1"><ArrowDown className="h-3 w-3"/>Move</span></span></div>
      </section>
    </div> : null}
  </div>;
}

export function SearchField({ placeholder = "Search..." }: { placeholder?: string }) {
  return <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm transition focus-within:border-[#6b6b66] focus-within:ring-4 focus-within:ring-[#e5f5ee]"><Search className="h-4 w-4"/><input aria-label="Search" className="w-full border-0 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none" placeholder={placeholder}/></label>;
}
