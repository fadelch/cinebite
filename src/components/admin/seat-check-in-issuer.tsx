"use client";
import { useRef, useState, type FormEvent } from "react";
import { useNotifications } from "@/components/ui/notification-provider";

export function SeatCheckInIssuer({ endpoint, seatLabel, disabled }: { endpoint: string; seatLabel: string; disabled: boolean }) {
  const notifications = useNotifications();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<{ accessCode: string; expiresAt: string } | null>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || disabled) return;
    const form = new FormData(event.currentTarget);
    if (form.get("ticketVerified") !== "on" || !String(form.get("ticketReference") ?? "").trim()) {
      notifications.error("Check the customer's ticket, screening and seat before issuing a code."); return;
    }
    submitting.current = true; setPending(true); setIssued(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ticketVerified: true, ticketReference: form.get("ticketReference"), replaceExistingSession: form.get("replaceExistingSession") === "on",
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not issue a check-in code.");
      if (!/^\d{12}$/.test(body.accessCode) || !Number.isFinite(Date.parse(body.expiresAt))) throw new Error("Could not read the issued code. Verify check-in with a supervisor.");
      setIssued({ accessCode: body.accessCode, expiresAt: body.expiresAt });
      formRef.current?.reset();
    } catch (error) { notifications.error(error instanceof Error ? error.message : "Check-in could not be completed."); }
    finally { submitting.current = false; setPending(false); }
  }

  return <div className="mt-4 border-t border-zinc-800 pt-4">
    <button type="button" className="cb-button-secondary w-full" disabled={disabled || pending} aria-expanded={open} onClick={() => { setIssued(null); formRef.current?.reset(); setOpen(!open); }}>Ticket check-in · {seatLabel}</button>
    {open ? <form ref={formRef} method="post" onSubmit={submit} className="mt-4 space-y-3">
      <label className="block text-sm text-zinc-300">Ticket / booking reference<input name="ticketReference" required maxLength={100} autoComplete="off" disabled={pending} className="cb-field mt-2" placeholder="No customer personal details" /></label>
      <label className="flex gap-2 text-sm text-zinc-300"><input name="ticketVerified" type="checkbox" required disabled={pending} />I checked the ticket and confirmed this seat for the live screening.</label>
      <label className="flex gap-2 text-xs leading-5 text-zinc-400"><input name="replaceExistingSession" type="checkbox" disabled={pending} />Authorize replacement of the existing session after this fresh code is verified.</label>
      <button type="submit" className="cb-button-primary w-full" disabled={pending || disabled}>{pending ? "Issuing…" : "Issue one-time code"}</button>
      {issued ? <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3"><p className="text-xs text-zinc-300">Give only to the checked-in customer. Shown once; hide after handover.</p><p className="mt-2 font-mono text-xl font-bold tracking-wider text-amber-300">{issued.accessCode.match(/.{4}/g)?.join(" ")}</p><p className="mt-2 text-xs text-zinc-400">Expires {new Date(issued.expiresAt).toLocaleTimeString()}. One use only.</p><button type="button" className="cb-button-secondary mt-3" onClick={() => setIssued(null)}>Hide code</button></div> : null}
    </form> : null}
  </div>;
}
