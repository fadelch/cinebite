import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { getCustomerOrder } from "@/server/services/order.service";

export const metadata = { title: "Order confirmed | CineBite" };

export default async function CustomerOrderPage({ params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const order = await getCustomerOrder(token, publicCode).catch(() => null);
  if (!order) notFound();
  return <main className="min-h-screen bg-[#09090b] px-4 py-8"><div className="mx-auto max-w-2xl">
    <section className="rounded-3xl border border-emerald-400/25 bg-emerald-400/8 p-6"><p className="text-xs font-semibold tracking-[0.18em] text-emerald-300 uppercase">Order confirmed</p><h1 className="mt-2 text-3xl font-semibold text-white">We received your order</h1><p className="mt-3 text-sm text-zinc-400">Order <span className="font-mono text-zinc-100">{order.publicOrderCode}</span> · Seat {order.seatLabel}</p></section>
    <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="border-b border-zinc-800 pb-4"><h2 className="font-semibold text-white">{order.movieTitle}</h2><p className="mt-1 text-sm text-zinc-500">{order.locationName} · {order.hallName}</p></div><div className="mt-4 space-y-4">{order.items.map((item, index) => <div key={`${item.productName}-${index}`} className="flex items-center gap-3">{item.imageUrl ? <div className="relative size-12 overflow-hidden rounded-lg"><Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" /></div> : null}<div className="flex-1"><p className="text-sm font-medium text-zinc-100">{item.quantity} × {item.productName}</p><p className="text-xs text-zinc-500">{money(item.unitPrice, item.currencyCode)} each</p></div><p className="font-semibold text-white">{money(item.lineTotal, item.currencyCode)}</p></div>)}</div><div className="mt-5 flex justify-between border-t border-zinc-800 pt-4 text-lg font-bold text-white"><span>Total</span><span>{money(order.total, order.currencyCode)}</span></div>{order.customerNote ? <p className="mt-4 rounded-xl bg-zinc-950 p-3 text-sm text-zinc-400">Note: {order.customerNote}</p> : null}</section>
    <Link href="/customer/menu" className="cb-button-secondary mt-5 w-full">Order more</Link>
  </div></main>;
}

function money(value: string, currency: string) { try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value)); } catch { return `${value} ${currency}`; } }
