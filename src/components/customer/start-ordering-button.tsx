"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useNotifications } from "@/components/ui/notification-provider";

export function StartOrderingButton({ credential }: { credential: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const notifications = useNotifications();
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const accessCode = (inputRef.current?.value ?? "").trim().replace(/[ -]/g, "");
    if (!/^\d{12}$/.test(accessCode)) { notifications.error("Enter the 12-digit code provided by staff at ticket check-in."); inputRef.current?.focus(); return; }
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/customer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, accessCode }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body));
      if (inputRef.current) inputRef.current.value = "";
      router.replace("/customer/menu");
      router.refresh();
    } catch (reason) {
      notifications.error(reason instanceof Error ? reason.message : "Ordering could not be started.");
      submitting.current = false;
      setPending(false);
    }
  }

  return <form method="post" onSubmit={start} className="mt-7 space-y-3" noValidate><label htmlFor="seat-access-code" className="block text-sm text-zinc-200">Ticket check-in code</label><p id="seat-access-help" className="text-sm leading-6 text-zinc-400">Enter the one-time code provided by cinema staff after they check your ticket. A photo of the seat QR alone cannot start an order.</p><input ref={inputRef} id="seat-access-code" type="text" inputMode="numeric" autoComplete="off" maxLength={16} required disabled={pending} aria-describedby="seat-access-help" placeholder="0000 0000 0000" className="cb-field text-lg tracking-wider" /><button type="submit" disabled={pending} className="min-h-14 w-full rounded-2xl bg-amber-400 px-5 text-base font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-60">{pending ? "Securing your seat…" : "Start ordering"}</button></form>;
}

function responseMessage(body: unknown): string {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Ordering could not be started.";
}
