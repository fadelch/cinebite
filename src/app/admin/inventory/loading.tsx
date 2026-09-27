export default function InventoryLoading() {
  return <div aria-label="Loading inventory" className="animate-pulse space-y-7"><div className="h-9 w-72 rounded-lg bg-zinc-800" /><div className="h-20 rounded-2xl border border-zinc-800 bg-zinc-900/60" /><div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-32 rounded-2xl border border-zinc-800 bg-zinc-900/60" />)}</div><div className="h-72 rounded-2xl border border-zinc-800 bg-zinc-900/60" /></div>;
}
