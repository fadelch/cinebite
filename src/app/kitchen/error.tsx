"use client";

export default function KitchenError({ reset }: { reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6"><section className="cb-panel p-6"><h1 className="text-xl font-semibold">Kitchen temporarily unavailable</h1><p className="mt-2 text-sm text-zinc-500">Check your location filters or try again.</p><button onClick={reset} className="cb-button-primary mt-5">Try again</button><a href="/kitchen" className="cb-button-secondary ml-3 mt-5">Reset filters</a></section></main>;
}
