import Link from "next/link";

import { getAdminOrder } from "@/server/services/order.service";

export const metadata = { title: "Order details" };

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const order = await getAdminOrder((await params).orderId);
  return <section className="max-w-4xl"><Link href="/admin/orders" className="text-sm text-amber-300">← All orders</Link><div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Placed order</p><h1 className="mt-2 font-mono text-3xl font-semibold text-white">{order.publicOrderCode}</h1></div><span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">{order.status}</span></div>
    <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_18rem]"><div className="cb-panel p-5"><h2 className="font-semibold text-white">Items</h2><div className="mt-4 divide-y divide-zinc-800">{order.items.map((item, index) => <div key={`${item.productName}-${index}`} className="flex justify-between gap-4 py-4"><div><p className="font-medium text-zinc-100">{item.quantity} × {item.productName}</p><p className="mt-1 text-xs text-zinc-500">{money(item.unitPrice, item.currencyCode)} each</p></div><p className="font-semibold text-white">{money(item.lineTotal, item.currencyCode)}</p></div>)}</div><div className="flex justify-between border-t border-zinc-700 pt-4 text-lg font-bold"><span>Total</span><span>{money(order.total, order.currencyCode)}</span></div>{order.customerNote ? <div className="mt-4 rounded-xl bg-zinc-950 p-3 text-sm text-zinc-400"><span className="font-semibold text-zinc-200">Customer note:</span> {order.customerNote}</div> : null}</div>
      <aside className="cb-panel h-fit p-5"><h2 className="font-semibold text-white">Seat context</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-zinc-600">Location</dt><dd className="mt-1 text-zinc-200">{order.locationName}</dd></div><div><dt className="text-zinc-600">Hall and seat</dt><dd className="mt-1 text-zinc-200">{order.hallName} · {order.seatLabel}</dd></div><div><dt className="text-zinc-600">Movie</dt><dd className="mt-1 text-zinc-200">{order.movieTitle}</dd></div><div><dt className="text-zinc-600">Placed</dt><dd className="mt-1 text-zinc-200">{new Date(order.createdAt).toLocaleString()}</dd></div></dl></aside></div>
  </section>;
}

function money(value: string, currency: string) { try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value)); } catch { return `${value} ${currency}`; } }
