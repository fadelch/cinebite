import { OrderTimeline } from "@/components/orders/order-timeline";
import { orderStatusLabel } from "@/lib/orders/status";
import { formatInTimeZone } from "@/lib/screenings/timezone";
import type { KitchenOrder } from "@/types/order";

export function KitchenOrderDetail({ order }: { order: KitchenOrder }) {
  return <div className="space-y-6">
    <div><p className="text-xs font-semibold tracking-widest text-amber-400 uppercase">Kitchen ticket</p>
      <h1 className="mt-2 font-mono text-2xl font-bold text-zinc-50">{order.publicOrderCode}</h1>
      <p className="mt-2 text-sm font-semibold text-emerald-300">{orderStatusLabel[order.status]}</p></div>
    <div className="grid grid-cols-2 gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
      <div><p className="text-xs text-zinc-500">Location</p><p className="mt-1 text-zinc-100">{order.locationName}</p></div>
      <div><p className="text-xs text-zinc-500">Hall / seat</p><p className="mt-1 font-semibold text-amber-300">{order.hallName} · {order.seatLabel}</p></div>
      <div className="col-span-2"><p className="text-xs text-zinc-500">Movie / screening</p><p className="mt-1 text-zinc-100">{order.movieTitle}</p><p className="mt-1 text-xs text-zinc-500">{formatInTimeZone(order.screeningStartsAt, order.timezone)}</p></div>
    </div>
    {order.screeningWarning ? <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">{order.screeningWarning}</p> : null}
    <section><h2 className="font-semibold text-zinc-100">Prepare these items</h2><ul className="mt-3 space-y-3">{order.items.map((item, index) => <li key={index} className="flex items-center gap-3 rounded-xl bg-zinc-950 p-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 font-bold text-amber-300">{item.quantity}</span><span className="text-sm font-medium text-zinc-100">{item.productName}</span></li>)}</ul></section>
    {order.customerNote ? <section className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><h2 className="text-xs font-semibold text-amber-300">Customer note</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-200">{order.customerNote}</p></section> : null}
    <OrderTimeline history={order.history} timezone={order.timezone} showStaff />
  </div>;
}
