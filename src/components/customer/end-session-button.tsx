"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EndSessionButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function endSession() {
    setPending(true);
    try {
      await fetch("/api/customer/session/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "END_SESSION" }) });
    } finally {
      router.replace("/");
      router.refresh();
    }
  }
  return <button type="button" onClick={endSession} disabled={pending} className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-60">{pending ? "Ending…" : "End seat session"}</button>;
}
