"use client";
import { useRef, useState } from "react";
import { useNotifications } from "@/components/ui/notification-provider";
export function IssueReporter({ publicCode, kitchen = false }: { publicCode: string; kitchen?: boolean }) {
  const [busy, setBusy] = useState(false), active = useRef(false), notifications = useNotifications();
  return <details className="mt-5 rounded-xl border border-zinc-700 p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-amber-300">Report an operational issue</summary><p className="mt-2 text-xs text-zinc-400">Reporting does not cancel, refund, restock, or rewind this order.</p><form className="mt-3 space-y-3" onSubmit={async event => {
    event.preventDefault(); if (active.current) return; const formElement = event.currentTarget, form = new FormData(formElement); active.current = true; setBusy(true);
    try { const response = await fetch(`/api/staff/orders/${publicCode}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: form.get("type"), note: form.get("note") }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); notifications.success("Issue reported. A supervisor can review it."); formElement.reset(); }
    catch (error) { notifications.error(error instanceof Error ? error.message : "Issue could not be reported."); }
    finally { active.current = false; setBusy(false); }
  }}><label className="block text-sm">Issue type<select name="type" className="cb-input mt-2 w-full">{(kitchen ? ["ITEM_MISSING", "ORDER_DAMAGED", "OTHER"] : ["CUSTOMER_UNAVAILABLE", "WRONG_SEAT_CONTEXT", "ORDER_DAMAGED", "ITEM_MISSING", "OTHER"]).map(type => <option key={type} value={type}>{type.replaceAll("_", " ").toLowerCase()}</option>)}</select></label><label className="block text-sm">Safe note (optional)<textarea name="note" maxLength={300} className="cb-input mt-2 w-full" /></label><button disabled={busy} className="cb-button-secondary min-h-12">{busy ? "Reporting…" : "Report issue"}</button></form></details>;
}
