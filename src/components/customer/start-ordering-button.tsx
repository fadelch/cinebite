"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartOrderingButton({ credential }: { credential: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/customer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body));
      router.replace("/customer/menu");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ordering could not be started.");
      setPending(false);
    }
  }

  return <div className="mt-7"><button type="button" onClick={start} disabled={pending} className="min-h-14 w-full rounded-2xl bg-amber-400 px-5 text-base font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-60">{pending ? "Securing your seat…" : "Start ordering"}</button>{error ? <p role="alert" className="mt-3 text-center text-sm text-red-300">{error}</p> : null}</div>;
}

function responseMessage(body: unknown): string {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Ordering could not be started.";
}
