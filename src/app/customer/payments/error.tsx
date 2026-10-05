"use client";
import Link from "next/link";
export default function PaymentError({ reset }: { reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-5"><section className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6"><h1 className="text-2xl font-semibold text-white">Payment status unavailable</h1><p role="alert" className="mt-4 text-sm text-zinc-400">We could not verify your payment session. Do not submit another payment until you can check the server status. If your seat session ended, contact the cinema team.</p><button onClick={reset} className="cb-button-primary mt-5 w-full">Check again</button><Link href="/customer/menu" className="mt-4 block text-center text-amber-300">Back to menu</Link></section></main>;
}
