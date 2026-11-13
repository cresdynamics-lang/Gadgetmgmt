export function PageLoading() {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <p className="text-sm text-[var(--foreground)]">Loading this page…</p>
      <div className="h-28 animate-pulse rounded-2xl bg-[var(--background)]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-[var(--background)]" />)}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--background)]" />
    </div>
  );
}
