export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl shadow-black/30 sm:p-12">
        <div className="mb-8 h-1 w-12 rounded-full bg-amber-400" />
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">
          Phase 1 — Foundation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
          CineBite
        </h1>
        <p className="mt-5 max-w-md text-lg leading-8 text-zinc-400">
          Cinema food delivered directly to your seat.
        </p>
      </section>
    </main>
  );
}
