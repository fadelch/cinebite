"use client";
import Link from "next/link";
export default function DeliveryError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-semibold">Delivery queue unavailable</h1><p className="mt-3 text-zinc-400">Check your filters and location access, then try again.</p><button onClick={reset} className="cb-button-primary mt-5">Try again</button><Link href="/delivery" className="cb-button-secondary ml-3">Reset filters</Link></main>;
}
