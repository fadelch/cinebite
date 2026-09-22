export default function SuperAdminLoading() {
  return (
    <div aria-label="Loading Super Admin content" role="status">
      <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
      <div className="mt-4 h-10 w-full max-w-md animate-pulse rounded-xl bg-zinc-800" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="cb-panel h-36 animate-pulse bg-zinc-900" />)}
      </div>
      <div className="cb-panel mt-8 h-72 animate-pulse bg-zinc-900" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
