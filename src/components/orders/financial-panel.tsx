"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { usePolling } from "@/lib/hooks/use-polling";
import { useNotifications } from "@/components/ui/notification-provider";
import { reasons } from "@/validation/cancellation";
import type { FinancialSummary } from "@/types/financial";
import { trapDialogFocus } from "@/components/ui/dialog-focus";

type Confirmation = { title: string; explanation: string; endpoint: string; data: Record<string, unknown>; action: string };
export function FinancialPanel({ identifier, admin = false, initial = null, onUpdated }: { identifier: string; admin?: boolean; initial?: FinancialSummary | null; onUpdated?: () => Promise<void> }) {
  const base = `/api/${admin ? "admin" : "customer"}/orders/${identifier}`;
  const { data: summary, error, refresh } = usePolling<FinancialSummary | null>(`${base}/financial`, initial);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null), [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("FULL");
  const dialog = useRef<HTMLDialogElement>(null), inFlight = useRef(false), keys = useRef(new Map<string, string>());
  const notifications = useNotifications(), router = useRouter(), reduced = useReducedMotion();
  useEffect(() => { if (!initial) void refresh(); }, [initial, refresh]);
  useEffect(() => { if (confirmation && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [confirmation]);
  function keyFor(action: string) { let key = keys.current.get(action); if (!key) { key = crypto.randomUUID(); keys.current.set(action, key); } return key; }
  async function perform() {
    if (!confirmation || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const response = await fetch(confirmation.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...confirmation.data, confirmed: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "This action could not be completed.");
      notifications.success("Saved. Financial status reflects verified provider results.");
      keys.current.clear(); dialog.current?.close(); setConfirmation(null);
      await refresh(); await onUpdated?.(); router.refresh();
    } catch (failure) { notifications.error(failure instanceof Error ? failure.message : "Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!summary) return <section className="cb-panel mt-5 p-5" aria-live="polite">{error ?? "Loading cancellation and refund status…"}</section>;
  const canceled = summary.status === "CANCELED";
  return <motion.section layout={!reduced} className="cb-panel mt-5 p-5 sm:p-6" aria-label="Cancellation and refunds">
    <p className="text-xs uppercase tracking-widest text-amber-300">Cancellations &amp; refunds</p>
    <h2 className="mt-3 text-xl font-semibold text-white" aria-live="polite">{canceled ? "Order canceled" : summary.fullyRefunded ? "Refund completed" : "Your financial status"}</h2>
    {canceled ? <p className="mt-2 text-sm text-zinc-400">Fulfillment stopped. Refunds and inventory are recorded separately; bank settlement is not instant.</p> : null}
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["Paid", summary.paidAmount], ["Refunded", summary.refundedAmount], ["Refund processing", summary.processingAmount], ...(admin ? [["Remaining refundable", summary.remainingRefundableAmount]] : [])].map(([label, value]) => <div key={label} className="rounded-xl bg-zinc-950 p-3"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-2 font-semibold text-white">{value} {summary.currencyCode}</dd></div>)}</dl>
    <p className="mt-3 text-xs text-zinc-500">Payment: {summary.paymentStatus}. Original charge and order history are preserved.</p>
    {summary.cancellation ? <p className="mt-3 break-words text-sm text-zinc-400">Reason: {label(summary.cancellation.reasonCode)}{admin ? ` · Inventory: ${label(summary.cancellation.inventoryDisposition)}` : ""}{summary.cancellation.inventoryDisposition === "HOLD_UNTIL_PROVIDER_FINAL" && ["PENDING", "PROCESSING"].includes(summary.paymentStatus) ? " · Provider cancellation is being confirmed; stock remains protected." : ""}</p> : null}
    {summary.refunds.length ? <ol className="mt-4 space-y-3" aria-label="Refund history">{summary.refunds.map((refund, index) => <li key={refund.id ?? index} className="rounded-xl border border-zinc-700 p-3">
      <p className="font-medium text-zinc-100">{refund.status === "SUCCEEDED" ? "Refund completed" : refund.status === "FAILED" ? refund.retryStatus === "SUCCEEDED" ? "Failed attempt · recovered by retry" : refund.retryStatus && ["PENDING", "PROCESSING"].includes(refund.retryStatus) ? "Failed attempt · retry processing" : "Refund requires attention" : ["PENDING", "PROCESSING"].includes(refund.status) ? "Refund processing" : "Refund canceled"} · {refund.amount} {refund.currencyCode}</p>
      <p className="mt-1 text-xs text-zinc-500">{label(refund.reasonCode)} · {new Date(refund.createdAt).toLocaleString()}{refund.retryOfId ? " · Retry of a failed refund" : ""}</p>
      {admin && refund.reasonNote ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">{refund.reasonNote}</p> : null}
      {admin && refund.status === "FAILED" && !summary.refunds.some(r => r.retryOfId === refund.id) ? <button className="cb-button-secondary mt-3 min-h-11" onClick={() => setConfirmation({ title: "Retry failed refund?", explanation: `Retry ${refund.amount} ${refund.currencyCode}. Remaining funds are checked again on the server.`, endpoint: `${base}/refunds/retry`, data: { refundId: refund.id, idempotencyKey: keyFor(`retry:${refund.id}`) }, action: "Retry refund" })}>Retry failed refund</button> : null}
      {admin && ["PENDING", "PROCESSING"].includes(refund.status) ? <div className="mt-3 flex flex-wrap gap-3"><span className="w-full text-xs text-amber-300">Sandbox only · No real funds returned</span>{["SUCCEEDED", "FAILED"].map(outcome => <button key={outcome} className="cb-button-secondary min-h-11 text-xs" onClick={() => setConfirmation({ title: "Simulate sandbox refund result?", explanation: "This test control verifies a signed sandbox provider result. It cannot refund real money.", endpoint: `${base}/refunds/sandbox`, data: { refundId: refund.id, outcome }, action: outcome === "SUCCEEDED" ? "Test refund success" : "Test refund failure" })}>{outcome === "SUCCEEDED" ? "Test refund success" : "Test refund failure"}</button>)}</div> : null}
    </li>)}</ol> : null}
    {error ? <p role="status" className="mt-3 text-sm text-amber-300">{error}</p> : null}
    {!admin && summary.canCancel ? <button className="cb-button-secondary mt-5 min-h-12 w-full" disabled={Boolean(error)} onClick={() => setConfirmation({ title: "Cancel this order?", explanation: "Only orders not yet accepted by the kitchen can be canceled. A captured payment starts a refund; pending payment cancellation must be confirmed by the provider. This does not promise instant bank settlement.", endpoint: `${base}/cancel`, data: {}, action: "Cancel order" })}>Cancel order</button> : null}
    {admin && !["CANCELED", "DELIVERED"].includes(summary.status) ? <form className="mt-5 space-y-3 border-t border-zinc-700 pt-5" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      setConfirmation({ title: summary.status === "PLACED" ? "Cancel this order?" : "Exceptional cancellation?", explanation: summary.status === "PLACED" ? "Stop fulfillment, start a refund of available captured funds, and restore original consumption before kitchen acceptance." : "Food preparation or delivery has begun. Stop fulfillment and start the remaining refund, but DO NOT automatically restock ingredients.", endpoint: `${base}/cancel`, data: { reasonCode: form.get("reasonCode"), reasonNote: form.get("reasonNote"), exceptional: summary.status !== "PLACED" }, action: "Confirm cancellation" });
    }}><h3 className="font-semibold text-white">{summary.status === "PLACED" ? "Cancel order" : "Exceptional staff cancellation"}</h3><ReasonFields /><button className="cb-button-secondary min-h-12" disabled={Boolean(error)}>Review cancellation</button></form> : null}
    {admin && summary.paymentStatus === "SUCCEEDED" && Number(summary.remainingRefundableAmount) > 0 ? <form className="mt-6 space-y-3 border-t border-zinc-700 pt-5" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const amount = kind === "PARTIAL" ? String(form.get("amount")) : undefined;
      setConfirmation({ title: `Confirm ${kind.toLowerCase()} refund?`, explanation: `Refund ${amount ?? summary.remainingRefundableAmount} ${summary.currencyCode}. The server rechecks the captured balance. This does not cancel a delivered order or restock inventory.`, endpoint: `${base}/refunds`, data: { kind, ...(amount ? { amount } : {}), reasonCode: form.get("reasonCode"), reasonNote: form.get("reasonNote"), idempotencyKey: keyFor(`refund:${kind}:${amount ?? "full"}`) }, action: "Start refund" });
    }}><h3 className="font-semibold text-white">Issue a financial refund</h3><p className="text-sm text-zinc-400">No automatic inventory restoration. Delivered orders remain delivered.</p><label className="block text-sm">Refund type<select value={kind} onChange={e => setKind(e.target.value)} className="cb-input mt-2 w-full"><option value="FULL">Full remaining refund</option><option value="PARTIAL">Partial refund</option></select></label>{kind === "PARTIAL" ? <label className="block text-sm">Amount ({summary.currencyCode})<input name="amount" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?" className="cb-input mt-2 w-full" placeholder="2.50" /></label> : null}<ReasonFields /><button className="cb-button-primary min-h-12" disabled={Boolean(error)}>Review refund</button></form> : null}
    {admin && summary.issues.length ? <section className="mt-6 border-t border-zinc-700 pt-5"><h3 className="font-semibold">Order exceptions</h3>{summary.issues.map(issue => <article key={issue.id} className="mt-3 rounded-xl border border-zinc-700 p-4"><p className="font-medium">{label(issue.type)} · {issue.status}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">{issue.note}</p>{issue.resolution ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-emerald-300">Resolution: {issue.resolution}</p> : <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); const resolution = new FormData(event.currentTarget).get("resolution"); setConfirmation({ title: "Resolve operational issue?", explanation: "Record the supervisor decision without silently refunding, restocking, or rewinding fulfillment. Use the separate financial actions if needed.", endpoint: `${base}/issues/resolve`, data: { issueId: issue.id, resolution }, action: "Resolve issue" }); }}><label className="block text-sm">Resolution<input name="resolution" required maxLength={300} className="cb-input mt-2 w-full" /></label><button className="cb-button-secondary min-h-11">Review resolution</button></form>}</article>)}</section> : null}
    <dialog ref={dialog} onKeyDown={trapDialogFocus} aria-labelledby="financial-confirm-title" aria-describedby="financial-confirm-description" onCancel={event => { if (busy) event.preventDefault(); else setConfirmation(null); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-zinc-600 bg-zinc-900 p-6 text-zinc-100 backdrop:bg-black/75">
      {confirmation ? <motion.div initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}><h3 id="financial-confirm-title" className="text-xl font-semibold">{confirmation.title}</h3><p id="financial-confirm-description" className="mt-4 text-sm leading-6 text-zinc-400">{confirmation.explanation}</p><div className="mt-6 grid gap-3"><button autoFocus disabled={busy} onClick={() => { dialog.current?.close(); setConfirmation(null); }} className="cb-button-secondary min-h-12">Keep / Go back</button><button disabled={busy} onClick={perform} className="cb-button-primary min-h-12" aria-busy={busy}>{busy ? "Saving…" : confirmation.action}</button></div></motion.div> : null}
    </dialog>
  </motion.section>;
}
function ReasonFields() { return <><label className="block text-sm">Reason<select name="reasonCode" className="cb-input mt-2 w-full" required>{reasons.map(reason => <option key={reason} value={reason}>{label(reason)}</option>)}</select></label><label className="block text-sm">Safe note (optional)<textarea name="reasonNote" maxLength={300} rows={2} className="cb-input mt-2 w-full" /></label></>; }
function label(value: string) { return value.replaceAll("_", " ").toLowerCase(); }
