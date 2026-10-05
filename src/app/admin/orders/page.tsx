import Link from "next/link";

import { listAdminOrders } from "@/server/services/order.service";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage() {
  const orders = await listAdminOrders();
  return <section><div><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Operations</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Customer orders</h1><p className="mt-2 text-sm text-zinc-500">Read-only orders placed from verified seat sessions.</p></div>
    <div className="cb-panel mt-7 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs tracking-wide text-zinc-500 uppercase"><tr><th className="px-5 py-4">Order</th><th className="px-5 py-4">Location / seat</th><th className="px-5 py-4">Movie</th><th className="px-5 py-4">Items</th><th className="px-5 py-4">Total</th><th className="px-5 py-4">Placed</th></tr></thead><tbody className="divide-y divide-zinc-800">{orders.map((order) => <tr key={order.id} className="hover:bg-zinc-900/60"><td className="px-5 py-4"><Link href={`/admin/orders/${order.id}`} className="font-mono font-semibold text-amber-300">{order.publicOrderCode}</Link></td><td className="px-5 py-4 text-zinc-300">{order.locationName}<span className="block text-xs text-zinc-600">{order.hallName} · Seat {order.seatLabel}</span></td><td className="px-5 py-4 text-zinc-300">{order.movieTitle}</td><td className="px-5 py-4 text-zinc-400">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td className="px-5 py-4 font-semibold text-zinc-100">{money(order.total, order.currencyCode)}</td><td className="px-5 py-4 text-zinc-500">{new Date(order.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>{!orders.length ? <p className="p-8 text-center text-sm text-zinc-500">No customer orders have been placed yet.</p> : null}</div>
  </section>;
}

function money(value: string, currency: string) { try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value)); } catch { return `${value} ${currency}`; } }
