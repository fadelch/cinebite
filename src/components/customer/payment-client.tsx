"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { usePolling } from "@/lib/hooks/use-polling";
import type { CustomerOrder } from "@/types/order";
import { FinancialPanel } from "@/components/orders/financial-panel";

export interface CustomerPayment {
  order: CustomerOrder; status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  provider: string; sandbox: boolean; reviewRequired: boolean; attemptCount: number; expiresAt: string;
  canRetry: boolean; canPay: boolean; succeededAt: string | null;
}
const messages = { PENDING: "Waiting for payment", PROCESSING: "Confirming your payment…", SUCCEEDED: "Payment confirmed", FAILED: "Payment failed", CANCELED: "Payment session ended" };
export function PaymentClient({ initialPayment }: { initialPayment: CustomerPayment }) {
  const { data: payment, error, refresh } = usePolling(`/api/customer/payments/${initialPayment.order.publicOrderCode}`, initialPayment);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false), retryKey = useRef<string | null>(null);
  const reduced = useReducedMotion();
  const order = payment.order;
  async function act(outcome: string | null) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailure(null);
    if (!outcome && !retryKey.current) retryKey.current = crypto.randomUUID();
    try {
      const response = await fetch(`/api/customer/payments/${order.publicOrderCode}${outcome ? "/sandbox" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outcome ? { outcome } : { idempotencyKey: retryKey.current }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Payment could not be updated.");
      if (!outcome) retryKey.current = null;
      await refresh();
    } catch (error) { setFailure(error instanceof Error ? error.message : "Payment could not be updated."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <main className="min-h-screen bg-[#09090b] px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]"><div className="mx-auto max-w-2xl">
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">CineBite · Secure checkout</p>
    <motion.section layout={!reduced} className="mt-5 rounded-3xl border border-zinc-700 bg-zinc-900 p-6">
      <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-200">Sandbox demo only · No real money is charged. Do not enter card details.</div>
      <motion.h1 key={`${payment.status}-${payment.reviewRequired}`} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-3xl font-semibold text-white" aria-live="polite">
        {order.status === "CANCELED" ? "Order canceled" : payment.reviewRequired ? "Payment needs cinema review" : messages[payment.status]}
      </motion.h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{order.status === "CANCELED" ? "Fulfillment is stopped. See the cancellation and refund status below; provider confirmation may take time." : payment.reviewRequired ? "A late payment was recorded, but your order was not sent to the kitchen. Please contact the cinema team. No automatic refund is performed."
        : payment.status === "SUCCEEDED" ? "Order received by CineBite. The kitchen can now prepare your seat order."
        : payment.status === "FAILED" ? "The test payment failed. Your stock reservation was released. You can safely retry the same order."
        : payment.status === "CANCELED" ? "The payment was cancelled, expired, or the screening closed. Your reservation was released. Retry is available only while ordering is open."
        : payment.status === "PROCESSING" ? "Waiting for the server to verify the payment result. A return URL is not payment confirmation."
        : "Your items are held briefly while you complete this test payment. Stock is consumed only after verified success."}</p>
      <p className="mt-4 text-xs text-zinc-500">Order <span className="font-mono text-zinc-200">{order.publicOrderCode}</span> · Attempt {payment.attemptCount}</p>
      <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-zinc-950 p-4"><p className="text-xs text-zinc-500">Hall</p><p className="mt-1 font-semibold text-white">{order.hallName}</p></div><div className="rounded-xl bg-zinc-950 p-4"><p className="text-xs text-zinc-500">Seat</p><p className="mt-1 text-xl font-bold text-amber-300">{order.seatLabel}</p></div></div>
      <p className="mt-5 font-semibold text-zinc-200">{order.movieTitle}</p><p className="mt-1 text-xs text-zinc-500">{order.locationName}</p>
      <div className="mt-5 divide-y divide-zinc-800">{order.items.map((item, index) => <div key={index} className="flex justify-between gap-4 py-3 text-sm"><span>{item.quantity} × {item.productName}</span><span>{item.lineTotal} {order.currencyCode}</span></div>)}</div>
      <div className="mt-3 flex justify-between border-t border-zinc-700 pt-5 text-xl font-semibold text-white"><span>Total</span><span>{order.total} {order.currencyCode}</span></div>
      <p role="status" className="mt-4 text-xs text-zinc-500">{error ?? (payment.canPay ? `Reservation ends ${new Date(payment.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Status updates automatically.` : "Server-verified payment status")}</p>
      {failure ? <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{failure}</p> : null}
      {payment.canPay ? <fieldset disabled={busy || Boolean(error)} className="mt-6 space-y-3"><legend className="mb-3 text-xs uppercase tracking-wider text-zinc-500">Sandbox provider controls</legend>
        <button onClick={() => act("SUCCEEDED")} className="cb-button-primary w-full min-h-12">{busy ? "Verifying…" : `Pay ${order.total} ${order.currencyCode} · Test success`}</button>
        <div className="grid grid-cols-2 gap-3"><button onClick={() => act("PROCESSING")} className="cb-button-secondary min-h-12">Test processing</button><button onClick={() => act("FAILED")} className="cb-button-secondary min-h-12">Test failure</button></div>
        <button onClick={() => act("CANCELED")} className="min-h-12 w-full text-sm text-zinc-400 underline">Cancel payment</button>
      </fieldset> : null}
      {payment.canRetry ? <button disabled={busy || Boolean(error)} onClick={() => act(null)} className="cb-button-primary mt-6 w-full min-h-12">{busy ? "Reserving…" : "Retry payment"}</button> : null}
      {payment.status === "SUCCEEDED" && !payment.reviewRequired && order.fulfillmentEligible ? <Link href={`/customer/orders/${order.publicOrderCode}`} className="cb-button-primary mt-6 w-full min-h-12">Follow your order</Link> : null}
      <Link href="/customer/menu" className="mt-5 block text-center text-sm text-amber-300">Back to menu</Link>
    </motion.section>
    <FinancialPanel identifier={order.publicOrderCode} onUpdated={refresh} />
  </div></main>;
}
