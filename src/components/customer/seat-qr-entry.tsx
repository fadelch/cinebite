"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useNotifications } from "@/components/ui/notification-provider";
import { seatQrEntryPath } from "@/lib/customer-session/seat-qr-entry";

export function SeatQrEntry() {
  const router = useRouter();
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    if (inputRef.current) inputRef.current.value = "";
    setInvalid(false);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const path = seatQrEntryPath(inputRef.current?.value ?? "", window.location.origin);
    if (!path) {
      setInvalid(true);
      notifications.error("Enter your seat code or a seat QR link from this CineBite site. Ask the cinema team if you need help.");
      inputRef.current?.focus();
      return;
    }
    setInvalid(false);
    // Navigate only to a validated local /s/ path, never to pasted external URLs
    // or directly into a guest session. The server checks the QR before consent.
    startTransition(() => router.push(path));
  }

  return (
    <div className="mt-7">
      <button ref={triggerRef} type="button" className="cb-button-primary" aria-expanded={open} aria-controls="seat-qr-entry" onClick={() => open ? close() : setOpen(true)} disabled={pending}>
        Start my order
      </button>
      <div id="seat-qr-entry" hidden={!open} className="mt-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 sm:p-5">
        <form method="post" onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="seat-qr-code" className="block text-sm font-medium text-zinc-200">Seat QR link or code</label>
            <p id="seat-qr-help" className="mt-2 text-sm leading-6 text-zinc-400">Paste the QR link or code provided at your seat. Next, confirm your movie and seat before ordering.</p>
            <input id="seat-qr-code" ref={inputRef} type="text" maxLength={2048} required autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="seat-qr-help" aria-invalid={invalid} onChange={() => setInvalid(false)} disabled={pending} placeholder="Paste your seat QR link or code" className="cb-field mt-3" />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="cb-button-primary" disabled={pending}>{pending ? "Opening your seat…" : "Continue to my seat"}</button>
            <button type="button" className="cb-button-secondary" onClick={close} disabled={pending}>Close</button>
          </div>
        </form>
      </div>
      <noscript><p className="mt-3 text-sm text-zinc-400">Scan your seat QR with your phone camera and enable JavaScript to order.</p></noscript>
    </div>
  );
}
