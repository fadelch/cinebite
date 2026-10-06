"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { NotificationBell } from "@/components/notifications/notification-center";
import { KitchenOrderDetail } from "@/components/kitchen/kitchen-order-detail";
import { useNotifications } from "@/components/ui/notification-provider";
import { usePolling } from "@/lib/hooks/use-polling";
import { elapsedOrderTime, nextOrderStatus, KITCHEN_STATUSES, orderActionLabel } from "@/lib/orders/status";
import { formatInTimeZone, todayInTimeZone } from "@/lib/screenings/timezone";
import type { KitchenLocation, KitchenOrder, KitchenQueue as Queue } from "@/types/order";
import type { OrderQueueQuery } from "@/validation/kitchen";

const columnLabels = { PLACED: "New orders", ACCEPTED: "Accepted", PREPARING: "Preparing", READY: "Ready" };
const columnStyle = { PLACED: "text-amber-300 border-amber-400/30", ACCEPTED: "text-sky-300 border-sky-400/30", PREPARING: "text-violet-300 border-violet-400/30", READY: "text-emerald-300 border-emerald-400/30" };

export function KitchenQueue({ initialQueue, locations, query, canOpenAdmin }: {
  initialQueue: Queue; locations: KitchenLocation[]; query: OrderQueueQuery; canOpenAdmin: boolean;
}) {
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
  const { data: queue, error, refresh } = usePolling(`/api/kitchen/orders?${params}`, initialQueue);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<KitchenOrder | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const notifications = useNotifications();
  const reduced = useReducedMotion();
  const currentLocation = locations.find((location) => location.id === query.locationId) ?? locations[0];

  async function transition(order: KitchenOrder) {
    setBusy(order.publicOrderCode);
    try {
      const response = await fetch(`/api/kitchen/orders/${order.publicOrderCode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStatus: order.status, toStatus: nextOrderStatus[order.status] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The order could not be updated.");
      if (selected?.publicOrderCode === order.publicOrderCode) setSelected(body);
      notifications.success(`${order.publicOrderCode}: ${columnLabels[body.status as keyof typeof columnLabels]}.`);
    } catch (failure) { notifications.error(failure instanceof Error ? failure.message : "The order could not be updated."); }
    finally { await refresh(); setBusy(null); }
  }

  function openOrder(order: KitchenOrder) { setSelected(order); dialog.current?.showModal(); }
  function pagination(page: number) { const values = new URLSearchParams(params); values.set("page", String(page)); return `/kitchen?${values}`; }

  return <main className="min-h-screen bg-[#09090b] p-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">CineBite kitchen</p><h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Kitchen operations</h1><p className="mt-1 text-sm text-zinc-500">Prepare orders for every seat.</p></div><div className="flex items-center gap-3">{canOpenAdmin ? <Link href="/admin/orders" className="cb-button-secondary">Admin orders</Link> : null}<LogoutButton /></div></header>
    <div className="mt-4 flex justify-end"><NotificationBell /></div>
    <form action="/kitchen" className="mt-6 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:grid-cols-3 xl:grid-cols-6">
      <label className="text-xs text-zinc-400">Location<select name="locationId" defaultValue={query.locationId ?? ""} className="cb-field mt-1"><option value="">All authorized locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Status<select name="status" defaultValue={query.status ?? ""} className="cb-field mt-1"><option value="">All kitchen steps</option>{KITCHEN_STATUSES.map((status) => <option key={status} value={status}>{columnLabels[status]}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Location date<input name="date" type="date" defaultValue={query.date} className="cb-field mt-1" /></label>
      <label className="text-xs text-zinc-400">Hall<input name="hall" defaultValue={query.hall} placeholder="Hall 1" className="cb-field mt-1" /></label>
      <label className="text-xs text-zinc-400">Order code<input name="code" defaultValue={query.code} placeholder="CB-…" className="cb-field mt-1" /></label>
      <div className="flex items-end gap-2"><button className="cb-button-primary flex-1">Filter</button>{currentLocation ? <Link href={`/kitchen?locationId=${encodeURIComponent(currentLocation.id)}&date=${todayInTimeZone(currentLocation.timezone)}`} className="cb-button-secondary">Today</Link> : null}</div>
    </form>
    <div className="my-5 flex flex-wrap items-center justify-between gap-2 text-xs"><p role="status" className={error ? "text-amber-300" : "text-zinc-500"}>{error ?? "Queue updates automatically every 5 seconds"}</p><span className="text-zinc-600">Oldest orders first · Page {queue.page}</span></div>
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
      {KITCHEN_STATUSES.filter((status) => !query.status || status === query.status).map((status) => <section key={status} aria-label={columnLabels[status]} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-3">
        <div className={`mb-4 flex items-center justify-between border-b pb-3 ${columnStyle[status]}`}><h2 className="font-semibold">{columnLabels[status]}</h2><span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs" aria-live="polite">{queue.counts[status]}</span></div>
        <div className="space-y-3"><AnimatePresence initial={false}>{queue.orders.filter((order) => order.status === status).map((order) => <motion.article layout={!reduced} key={order.publicOrderCode} initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.15 }} className="rounded-xl border border-zinc-700/70 bg-zinc-900 p-4" data-order-code={order.publicOrderCode}>
          <button className="text-left font-mono text-sm font-semibold text-zinc-100 underline-offset-4 hover:underline" onClick={() => openOrder(order)} aria-label={`Open order ${order.publicOrderCode}`}>{order.publicOrderCode}</button>
          <div className="mt-2 flex items-center justify-between gap-2"><span className="text-sm font-bold text-amber-300">{order.hallName} · {order.seatLabel}</span><span className="text-xs text-zinc-500">{elapsedOrderTime(order.createdAt, Date.parse(queue.fetchedAt))}</span></div>
          <p className="mt-1 truncate text-xs text-zinc-500">{order.movieTitle} · {order.locationName}</p>
          <p className="mt-1 text-[0.65rem] text-zinc-600"><time dateTime={order.createdAt}>{formatInTimeZone(order.createdAt, order.timezone)}</time></p>
          {status !== "PLACED" ? <p className="mt-1 text-xs text-zinc-500">{columnLabels[status]} for {elapsedOrderTime(order.history.at(-1)?.createdAt ?? order.createdAt, Date.parse(queue.fetchedAt))}</p> : null}
          <ul className="my-4 space-y-2">{order.items.map((item, index) => <li key={index} className="flex gap-2 text-sm text-zinc-200"><span className="min-w-5 font-bold text-zinc-50">{item.quantity}×</span>{item.productName}</li>)}</ul>
          {order.customerNote ? <p className="mb-4 whitespace-pre-wrap break-words rounded-lg bg-amber-400/5 p-2 text-xs leading-5 text-amber-200">{order.customerNote}</p> : null}
          {order.screeningWarning ? <p className="mb-3 text-xs text-amber-300">{order.screeningWarning}</p> : null}
          {orderActionLabel[status] ? <button disabled={busy !== null} onClick={() => transition(order)} className="cb-button-primary w-full" aria-busy={busy === order.publicOrderCode}>{busy === order.publicOrderCode ? "Updating…" : orderActionLabel[status]}</button> : <p className="rounded-lg bg-emerald-400/10 p-3 text-center text-xs font-medium text-emerald-300">Preparation complete</p>}
        </motion.article>)}</AnimatePresence>{!queue.orders.some((order) => order.status === status) ? <p className="py-8 text-center text-sm text-zinc-600">No orders on this page</p> : null}</div>
      </section>)}
    </div>
    <nav aria-label="Queue pages" className="mt-6 flex justify-end gap-3">{queue.page > 1 ? <Link href={pagination(queue.page - 1)} className="cb-button-secondary">Previous page</Link> : null}{Object.values(queue.counts).some((count) => count > queue.page * queue.pageSize) ? <Link href={pagination(queue.page + 1)} className="cb-button-secondary">Next page</Link> : null}</nav>
    <dialog ref={dialog} onClose={() => setSelected(null)} aria-label="Kitchen order detail" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-200 shadow-2xl backdrop:bg-black/75">
      <button onClick={() => dialog.current?.close()} className="cb-button-secondary mb-5">Close ticket</button>
      {selected ? <DrawerTicket key={selected.publicOrderCode} initialOrder={selected} transition={transition} busy={busy !== null} /> : null}
    </dialog>
  </main>;
}

function DrawerTicket({ initialOrder, transition, busy }: { initialOrder: KitchenOrder; transition: (order: KitchenOrder) => Promise<void>; busy: boolean }) {
  const { data: order, error, refresh } = usePolling(`/api/kitchen/orders/${initialOrder.publicOrderCode}`, initialOrder);
  return <><KitchenOrderDetail order={order} />{error ? <p role="status" className="mt-4 text-sm text-amber-300">{error}</p> : null}{orderActionLabel[order.status] ? <button onClick={async () => { await transition(order); await refresh(); }} disabled={busy} className="cb-button-primary mt-6 w-full">{busy ? "Updating…" : orderActionLabel[order.status]}</button> : null}<Link href={`/kitchen/orders/${order.publicOrderCode}`} className="mt-4 block text-center text-sm text-amber-300">Open full ticket</Link></>;
}
