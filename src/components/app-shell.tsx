"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { navItems } from "@/lib/navigation";
import { canAccessPage } from "@/lib/access";

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.75]">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.75]">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="m5 12 4 4L19 2" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.75]">
      <circle cx="11" cy="11" r="5" />
      <path d="M16 16 20 20" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="m12 2 1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2Z" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.75]">
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const displayName = session?.user?.name ?? "Team member";
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#0a0a0a]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] border-r border-[#e5e5e5] bg-white/60">
        <aside className="hidden w-[280px] flex-col justify-between border-r border-[#e5e5e5] bg-[#0a0a0a] p-6 text-white lg:flex">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-semibold text-[#0a0a0a]">
                GH
              </div>
              <div>
                <p className="text-xl font-semibold tracking-tight">GadgetHub</p>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/60">Operations</p>
              </div>
            </div>

            <nav className="space-y-2">
              {navItems.filter(({ href }) => canAccessPage(session?.user.role ?? "", href)).map(({ label, href }) => {
                const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

                return (
                  <Link
                    key={label}
                    href={href}
                    className={[
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition",
                      isActive ? "bg-white text-[#0a0a0a]" : "text-white/75 hover:bg-white/5 hover:text-white",
                    ].join(" ")}
                  >
                    <span>{label}</span>
                    {isActive ? <IconSparkle /> : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <IconCheck />
              </span>
              <span>{displayName} / {session?.user.branchName ?? "No branch assigned"}</span>
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <header className="flex items-center justify-between border-b border-[#e5e5e5] bg-[#fafafa] px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button type="button" className="rounded-xl border border-[#e5e5e5] bg-white p-2 lg:hidden">
                <IconMenu />
              </button>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#5f5f5f]">Operations</p>
                <h1 className="text-xl font-semibold tracking-tight">{navItems.find(({ href }) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href)))?.label ?? "Dashboard"}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-3 py-2 text-sm shadow-sm md:flex">
                <span className="font-medium text-[#0a0a0a]">All Branches</span>
                <IconChevron />
              </div>

              <button type="button" className="relative rounded-full border border-[#e5e5e5] bg-white p-2.5 shadow-sm">
                <IconBell />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
              </button>

              <button type="button" onClick={() => void signOut({ redirectTo: "/login" })} title="Sign out" aria-label={`Sign out ${displayName}`} className="flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-2 py-1.5 shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0a0a0a] text-xs font-semibold text-white">
                  {initials}
                </div>
                <IconChevron />
              </button>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function SearchField({ placeholder = "Search..." }: { placeholder?: string }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#4d4d4d] shadow-sm">
      <IconSearch />
      <input
        aria-label="Search"
        className="w-full border-0 bg-transparent text-sm text-[#111111] placeholder:text-[#8f8f8f] focus:outline-none"
        placeholder={placeholder}
      />
    </label>
  );
}
