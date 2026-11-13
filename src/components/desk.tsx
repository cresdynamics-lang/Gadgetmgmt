import type { ReactNode } from "react";

export function Desk({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[0_4px_18px_rgb(0_0_0/.03)] sm:px-6">
        <h2 className="text-xl font-semibold tracking-[-.03em] text-[var(--foreground)]">{title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--muted)]">{detail}</p>
      </section>
      {children}
    </div>
  );
}

export function DeskNote({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-8 text-sm leading-6 text-[var(--foreground)]">{children}</p>;
}
