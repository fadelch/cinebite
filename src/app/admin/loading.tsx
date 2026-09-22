export default function AdminLoading() {
  return (
    <div aria-label="Loading cinema management" className="animate-pulse space-y-7">
      <div className="h-8 w-72 rounded-lg bg-zinc-800" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-36 rounded-2xl border border-zinc-800 bg-zinc-900/60" />)}
      </div>
      <div className="h-72 rounded-2xl border border-zinc-800 bg-zinc-900/60" />
    </div>
  );
}
