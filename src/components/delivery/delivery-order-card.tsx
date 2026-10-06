"use client";
import { elapsedOrderTime, orderStatusLabel } from "@/lib/orders/status";
import { formatInTimeZone } from "@/lib/screenings/timezone";
import type { DeliveryOrder } from "@/types/order";
import { IssueReporter } from "@/components/orders/issue-reporter";

export function DeliveryOrderCard({ order, now, busy, action, open, expanded = false }: {
  order: DeliveryOrder; now: string; busy: boolean; action: (order: DeliveryOrder) => void; open: (order: DeliveryOrder) => void; expanded?: boolean;
}) {
  const time = order.status === "READY" ? order.readyAt : order.status === "DELIVERED" ? order.deliveredAt : order.deliveryClaimedAt;
  const timeLabel = order.status === "READY" ? "Ready" : order.status === "DELIVERED" ? "Delivered" : "Claimed";
  const age = time ? elapsedOrderTime(time, Date.parse(now)) : null;
  if (order.status === "DELIVERED" && !expanded) return <article className="rounded-xl border border-emerald-400/15 bg-zinc-900 p-4" data-order-code={order.publicOrderCode}>
    <div className="flex flex-wrap items-center justify-between gap-2"><button onClick={() => open(order)} aria-label={`Open delivery ${order.publicOrderCode}`} className="min-h-11 font-mono text-sm font-semibold text-zinc-100 hover:underline">{order.publicOrderCode}</button><span className="text-xs font-semibold text-emerald-300">Delivered to seat</span></div>
    <p className="mt-1 text-lg font-bold text-amber-200">{order.hallName} · Seat {order.seatLabel}</p>
    <p className="mt-2 text-xs text-zinc-500">{order.movieTitle} · {order.locationName}</p>
    {time ? <p className="mt-2 text-xs text-zinc-400">Delivered {age === "Just now" ? "just now" : `${age} ago`} · <time dateTime={time}>{formatInTimeZone(time, order.timezone)}</time></p> : null}
    {order.assignedStaffName ? <p className="mt-2 text-xs text-sky-300">Assigned to {order.assignedStaffName}</p> : null}
    {expanded && order.canDeliver ? <IssueReporter publicCode={order.publicOrderCode} /> : null}
  </article>;
  return <article className="rounded-2xl border border-zinc-700/70 bg-zinc-900 p-4" data-order-code={order.publicOrderCode}>
    <div className="flex flex-wrap items-center justify-between gap-2">{expanded ? <p className="flex min-h-11 items-center font-mono text-sm font-semibold text-zinc-100">{order.publicOrderCode}</p> : <button className="min-h-11 font-mono text-sm font-semibold text-zinc-100 hover:underline" onClick={() => open(order)} aria-label={`Open delivery ${order.publicOrderCode}`}>{order.publicOrderCode}</button>}<span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">{orderStatusLabel[order.status]}</span></div>
    <div data-destination className="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><div><p className="text-xs text-zinc-400">Hall</p><p className="mt-1 break-words text-xl font-bold text-amber-200">{order.hallName}</p></div><div><p className="text-xs text-zinc-400">Seat</p><p className="mt-1 break-words text-3xl font-bold text-white">{order.seatLabel}</p></div></div>
    <p className="mt-3 break-words text-sm font-medium text-zinc-200">{order.movieTitle}</p><p className="mt-1 text-xs text-zinc-500">{order.locationName}</p>
    {time ? <p className="mt-3 text-xs text-zinc-400">{timeLabel} {age === "Just now" ? "just now" : `${age} ago`} · <time dateTime={time}>{formatInTimeZone(time, order.timezone)}</time></p> : null}
    {order.assignedStaffName ? <p className="mt-2 text-xs text-sky-300">Assigned to {order.assignedStaffName}</p> : null}
    <ul className="my-4 space-y-2">{order.items.map((item, i) => <li key={i} className="flex gap-2 text-sm text-zinc-200"><span className="font-bold text-white">{item.quantity}×</span>{item.productName}</li>)}</ul>
    {order.customerNote ? <p className="mb-4 whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300">Note: {order.customerNote}</p> : null}
    {order.screeningWarning ? <p className="mb-4 text-sm text-amber-300">{order.screeningWarning}</p> : null}
    {order.canClaim || order.canDeliver ? <button disabled={busy} onClick={() => action(order)} className="cb-button-primary w-full">{busy ? "Updating…" : order.canClaim ? "Claim delivery" : "Mark delivered"}</button> : <p className="rounded-lg bg-emerald-400/5 p-3 text-center text-xs text-emerald-300">{order.status === "DELIVERED" ? "Delivered to seat" : "Supervisor view · read only"}</p>}
  </article>;
}
