"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { NotificationBell } from "@/components/notifications/notification-center";
import { DeliveryOrderCard } from "@/components/delivery/delivery-order-card";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { useNotifications } from "@/components/ui/notification-provider";
import { usePolling } from "@/lib/hooks/use-polling";
import type { DeliveryOrder, DeliveryQueue as Queue, KitchenLocation } from "@/types/order";
import type { DeliveryQueueQuery } from "@/validation/delivery";

export function DeliveryQueue({ initialQueue, query, locations, staff, supervisor }: {
  initialQueue: Queue; query: DeliveryQueueQuery; locations: KitchenLocation[]; staff: { id: string; displayName: string }[]; supervisor: boolean;
}) {
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const { data: queue, error, refresh } = usePolling(`/api/delivery/orders?${params}`, initialQueue);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [selected, setSelected] = useState<DeliveryOrder | null>(null);
  const activeHeading = useRef<HTMLHeadingElement>(null);
  const deliveredHeading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const notifications = useNotifications();
  const reduced = useReducedMotion();
  async function action(order: DeliveryOrder) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    let completed: string | null = null;
    try {
      const response = await fetch(`/api/delivery/orders/${order.publicOrderCode}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedStatus: order.status, toStatus: order.canClaim ? "OUT_FOR_DELIVERY" : "DELIVERED" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The delivery could not be updated.");
      if (selected?.publicOrderCode === order.publicOrderCode) setSelected(body);
      completed = body.status;
      const message = body.status === "DELIVERED" ? `${order.publicOrderCode} delivered to ${order.hallName}, seat ${order.seatLabel}.` : `${order.publicOrderCode} claimed. It is now in My deliveries.`;
      notifications.success(message);
    } catch (failure) { notifications.error(failure instanceof Error ? failure.message : "The delivery could not be updated."); }
    finally {
      await refresh(); busyRef.current = false; setBusy(false);
      if (completed && !dialog.current?.open) (completed === "DELIVERED" ? deliveredHeading : activeHeading).current?.focus();
    }
  }
  function open(order: DeliveryOrder) { setSelected(order); dialog.current?.showModal(); }
  function pageHref(page: number) { const values = new URLSearchParams(params); values.set("page", String(page)); return `/delivery?${values}`; }
  const sections = [{ key: "ready", title: "Ready to claim", hint: "Oldest ready orders first" }, { key: "active", title: supervisor ? "Active deliveries" : "My deliveries", hint: supervisor ? "Assigned workers · scoped oversight" : "Your claimed orders · head to the seat" }, { key: "delivered", title: "Recently delivered", hint: "Newest deliveries first · bounded history" }] as const;
  const visibleSections = !supervisor && queue.active.length > 0 ? [sections[1], sections[0], sections[2]]
    : !supervisor && queue.ready.length === 0 && queue.delivered.length > 0 ? [sections[2], sections[0], sections[1]] : sections;
  return <main className="min-h-screen bg-[#09090b] p-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">CineBite delivery</p><h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Delivery operations</h1><p className="mt-2 text-sm text-zinc-400">From the kitchen, directly to the seat.</p></div><div className="flex gap-3">{supervisor ? <Link href="/admin/orders" className="cb-button-secondary">Admin orders</Link> : null}<LogoutButton /></div></header>
    <div className="mt-4 flex justify-end"><NotificationBell /></div>
    <details className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-zinc-300">Filters and delivery history</summary><form action="/delivery" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <label className="text-xs text-zinc-400">Location<select name="locationId" defaultValue={query.locationId ?? ""} className="cb-field mt-1">{locations.length !== 1 ? <option value="">All authorized locations</option> : null}{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Hall<input name="hall" defaultValue={query.hall} placeholder="Hall 1" className="cb-field mt-1" /></label>
      <label className="text-xs text-zinc-400">Order code<input name="code" defaultValue={query.code} placeholder="CB-…" className="cb-field mt-1" /></label>
      <label className="text-xs text-zinc-400">Delivered date (location time)<input name="date" type="date" defaultValue={query.date} className="cb-field mt-1" /></label>
      {supervisor ? <label className="text-xs text-zinc-400">Assigned worker<select name="staffId" defaultValue={query.staffId ?? ""} className="cb-field mt-1"><option value="">All scoped workers</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}</select></label> : null}
      <div className="flex items-end gap-2"><button className="cb-button-primary flex-1">Filter</button><Link href="/delivery" className="cb-button-secondary">Reset</Link></div>
    </form></details>
    <p role="status" className="my-5 text-xs text-zinc-500">{error ?? "Queue updates automatically every 5 seconds"}</p>
    <div className="grid items-start gap-4 lg:grid-cols-3">{visibleSections.map((section) => <section key={section.key} aria-label={section.title} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-3">
      <div className="mb-4 border-b border-zinc-800 pb-3"><div className="flex items-center justify-between gap-2"><h2 ref={section.key === "active" ? activeHeading : section.key === "delivered" ? deliveredHeading : undefined} tabIndex={-1} className="font-semibold text-white focus:outline-amber-400">{section.title}</h2><span aria-live="polite" className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-amber-200">{queue.counts[section.key]}</span></div><p className="mt-2 text-xs text-zinc-500">{section.hint}</p></div>
      <div className="space-y-3"><AnimatePresence initial={false}>{queue[section.key].map((order) => <motion.div key={order.publicOrderCode} layout={!reduced} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.15 }}><DeliveryOrderCard order={order} now={queue.fetchedAt} busy={busy} action={action} open={open} /></motion.div>)}</AnimatePresence>{queue[section.key].length === 0 ? <p className="py-6 text-center text-sm text-zinc-600">No deliveries on this page</p> : null}</div>
    </section>)}</div>
    <nav aria-label="Delivery pages" className="mt-6 flex flex-wrap items-center justify-end gap-3"><span className="text-xs text-zinc-500">Page {queue.page} · up to {queue.pageSize} per section</span>{queue.page > 1 ? <Link href={pageHref(queue.page - 1)} className="cb-button-secondary">Previous page</Link> : null}{Object.values(queue.counts).some((n) => n > queue.page * queue.pageSize) ? <Link href={pageHref(queue.page + 1)} className="cb-button-secondary">Next page</Link> : null}</nav>
    <dialog ref={dialog} onClose={() => setSelected(null)} aria-label="Delivery destination and timeline" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-200 backdrop:bg-black/75"><button onClick={() => dialog.current?.close()} className="cb-button-secondary mb-4">Close delivery</button>{selected ? <DeliveryTicket key={selected.publicOrderCode} initialOrder={selected} busy={busy} action={action} /> : null}</dialog>
  </main>;
}
function DeliveryTicket({ initialOrder, busy, action }: { initialOrder: DeliveryOrder; busy: boolean; action: (o: DeliveryOrder) => Promise<void> }) {
  const { data: order, error, refresh } = usePolling(`/api/delivery/orders/${initialOrder.publicOrderCode}`, initialOrder);
  return <><DeliveryOrderCard expanded order={order} now={new Date().toISOString()} busy={busy || Boolean(error)} action={async (o) => { await action(o); await refresh(); }} open={() => {}} />{error ? <p className="mt-3 text-sm text-amber-300" role="status">{error}</p> : null}<section className="mt-6 px-3"><OrderTimeline history={order.history} timezone={order.timezone} showStaff /></section></>;
}
