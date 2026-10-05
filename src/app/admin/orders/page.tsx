import Link from "next/link";

import { ORDER_STATUSES, orderStatusLabel } from "@/lib/orders/status";
import { formatInTimeZone } from "@/lib/screenings/timezone";
import { listAdminOrders } from "@/server/services/order.service";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = Object.fromEntries(Object.entries(await searchParams).filter(([, value]) => typeof value === "string" && value !== ""));
  const { orders, total, page, pageSize, locations, query } = await listAdminOrders(values);
  function pageUrl(next: number) { const params = new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)])); params.set("page", String(next)); return `/admin/orders?${params}`; }
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Operations</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Customer orders</h1><p className="mt-2 text-sm text-zinc-500">Order contents and preparation history.</p></div><Link href="/kitchen" className="cb-button-secondary">Open kitchen</Link></div>
    <form className="cb-panel mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-xs text-zinc-400">Location<select name="locationId" defaultValue={query.locationId ?? ""} className="cb-field mt-1"><option value="">All authorized locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Status<select name="status" defaultValue={query.status ?? ""} className="cb-field mt-1"><option value="">All statuses</option>{ORDER_STATUSES.map((status) => <option key={status} value={status}>{orderStatusLabel[status]}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Location date<input type="date" name="date" defaultValue={query.date} className="cb-field mt-1" /></label>
      <label className="text-xs text-zinc-400">Order code<input name="code" defaultValue={query.code} placeholder="CB-…" className="cb-field mt-1" /></label>
      <button className="cb-button-primary self-end">Apply filters</button>
    </form>
    <div className="cb-panel mt-5 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-500 uppercase"><tr>{["Order", "Location / seat", "Movie", "Status", "Total", "Placed"].map((label) => <th key={label} className="px-5 py-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-800">{orders.map((order) => <tr key={order.id} className="hover:bg-zinc-900/60"><td className="px-5 py-4"><Link href={`/admin/orders/${order.id}`} className="font-mono font-semibold text-amber-300">{order.publicOrderCode}</Link></td><td className="px-5 py-4 text-zinc-300">{order.locationName}<span className="block text-xs text-zinc-600">{order.hallName} · Seat {order.seatLabel}</span></td><td className="px-5 py-4 text-zinc-300">{order.movieTitle}</td><td className="px-5 py-4 text-emerald-300">{orderStatusLabel[order.status]}</td><td className="px-5 py-4 font-semibold text-zinc-100">{money(order.total, order.currencyCode)}</td><td className="px-5 py-4 text-xs text-zinc-500">{formatInTimeZone(order.createdAt, order.timezone)}</td></tr>)}</tbody></table></div>{!orders.length ? <p className="p-8 text-center text-sm text-zinc-500">No orders match these filters.</p> : null}</div>
    <nav aria-label="Order history pages" className="mt-5 flex items-center justify-end gap-3 text-xs text-zinc-500"><span>{total} orders · Page {page}</span>{page > 1 ? <Link href={pageUrl(page - 1)} className="cb-button-secondary">Previous</Link> : null}{page * pageSize < total ? <Link href={pageUrl(page + 1)} className="cb-button-secondary">Next</Link> : null}</nav>
  </section>;
}

function money(value: string, currency: string) { try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value)); } catch { return `${value} ${currency}`; } }
