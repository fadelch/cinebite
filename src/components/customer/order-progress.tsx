"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { OrderTimeline } from "@/components/orders/order-timeline";
import { usePolling } from "@/lib/hooks/use-polling";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/orders/status";
import type { CustomerOrder } from "@/types/order";
import { FinancialPanel } from "@/components/orders/financial-panel";
import { CustomerNotifications } from "@/components/notifications/customer-notifications";

const progressMessage = {
  PLACED: "We received your order", ACCEPTED: "The kitchen accepted your order",
  PREPARING: "Your order is being prepared", READY: "Your order is ready",
  OUT_FOR_DELIVERY: "Your order is on the way to your seat.", DELIVERED: "Delivered.", CANCELED: "Order canceled",
};

export function CustomerOrderProgress({ initialOrder }: { initialOrder: CustomerOrder }) {
  return <><CustomerOrderProgressContent initialOrder={initialOrder} /><div className="bg-[#09090b] px-4 pb-6"><CustomerNotifications code={initialOrder.publicOrderCode}/></div></>;
}
function CustomerOrderProgressContent({ initialOrder }: { initialOrder: CustomerOrder }) {
  const { data: order, error, refresh } = usePolling(`/api/customer/orders/${initialOrder.publicOrderCode}`, initialOrder);
  const reduced = useReducedMotion();
  const current = ORDER_STATUSES.findIndex(status => status === order.status);
  if (order.status === "CANCELED") return <main className="min-h-screen bg-zinc-950 px-4 py-8"><div className="mx-auto max-w-2xl"><p className="text-xs uppercase tracking-widest text-amber-300">CineBite · Order {order.publicOrderCode}</p><h1 className="mt-4 text-3xl font-semibold">Order canceled</h1><p className="mt-3 text-zinc-400">{order.movieTitle} · {order.hallName} · Seat {order.seatLabel}</p><FinancialPanel identifier={order.publicOrderCode} onUpdated={refresh} /><section className="cb-panel mt-5 p-5"><OrderTimeline history={order.history} timezone={order.timezone} /></section><Link href="/customer/menu" className="cb-button-secondary mt-5 w-full">Back to menu</Link></div></main>;
  if (order.paymentPolicy === "ONLINE_REQUIRED" && !order.fulfillmentEligible) return <main className="min-h-screen bg-zinc-950 p-6"><div className="mx-auto max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6"><h1 className="text-2xl font-semibold">Payment confirmation required</h1><p className="mt-3 text-zinc-400">Your order is not yet cleared for the kitchen.</p><Link href={`/customer/payments/${order.publicOrderCode}`} className="cb-button-primary mt-5">View payment status</Link><FinancialPanel identifier={order.publicOrderCode} onUpdated={refresh} /></div></main>;
  return <main className="min-h-screen bg-[#09090b] px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]"><div className="mx-auto max-w-2xl">
    <section className="rounded-3xl border border-emerald-400/25 bg-emerald-400/8 p-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-emerald-300 uppercase">Order progress</p>
      <motion.h1 key={order.status} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-3xl font-semibold text-white" aria-live="polite">{progressMessage[order.status]}</motion.h1>
      <p className="mt-3 text-sm text-zinc-400">Order <span className="font-mono text-zinc-100">{order.publicOrderCode}</span> · Seat {order.seatLabel}</p>
      <ol aria-label="Fulfillment progress" className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">{ORDER_STATUSES.map((status, index) => <li key={status} aria-current={status === order.status ? "step" : undefined} className="min-w-0"><div aria-hidden="true" className={`h-1 rounded-full ${index <= current ? "bg-emerald-400" : "bg-zinc-700"}`} /><p className={`mt-2 text-[0.65rem] ${index <= current ? "text-emerald-200" : "text-zinc-500"}`}>{orderStatusLabel[status]}</p></li>)}</ol>
      <p role="status" className="mt-4 text-xs text-zinc-500">{error ?? "Progress updates automatically"}</p>
    </section>
    <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="border-b border-zinc-800 pb-4"><h2 className="font-semibold text-white">{order.movieTitle}</h2><p className="mt-1 text-sm text-zinc-500">{order.locationName} · {order.hallName}</p></div><div className="mt-4 space-y-4">{order.items.map((item, index) => <div key={index} className="flex items-center gap-3">{item.imageUrl ? <div className="relative size-12 shrink-0 overflow-hidden rounded-lg"><Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" /></div> : null}<div className="min-w-0 flex-1"><p className="text-sm font-medium text-zinc-100">{item.quantity} × {item.productName}</p><p className="text-xs text-zinc-500">{money(item.unitPrice, item.currencyCode)} each</p></div><p className="shrink-0 font-semibold text-white">{money(item.lineTotal, item.currencyCode)}</p></div>)}</div><div className="mt-5 flex justify-between border-t border-zinc-800 pt-4 text-lg font-bold text-white"><span>Total</span><span>{money(order.total, order.currencyCode)}</span></div>{order.customerNote ? <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-3 text-sm text-zinc-400">Note: {order.customerNote}</p> : null}</section>
    <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><OrderTimeline history={order.history} timezone={order.timezone} /></section>
    <FinancialPanel identifier={order.publicOrderCode} onUpdated={refresh} />
    <Link href="/customer/menu" className="cb-button-secondary mt-5 w-full">Order more</Link>
  </div></main>;
}

function money(value: string, currency: string) { try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value)); } catch { return `${value} ${currency}`; } }
