"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { CustomerCart } from "@/types/order";

export function CartClient({ initialCart, context }: { initialCart: CustomerCart; context: { movieTitle: string; hallName: string; seatLabel: string } | null }) {
  const router = useRouter();
  const [cart, setCart] = useState(initialCart);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const checkoutKey = useRef<string | null>(null);

  async function update(productSlug: string, quantity: number) {
    setBusySlug(productSlug); setMessage(null);
    try {
      const response = await fetch("/api/customer/cart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productSlug, quantity }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Cart could not be updated.");
      setCart(body); checkoutKey.current = null;
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Cart could not be updated." }); }
    finally { setBusySlug(null); }
  }

  async function checkout() {
    if (!checkoutKey.current) checkoutKey.current = crypto.randomUUID();
    setPlacing(true); setMessage(null);
    try {
      const response = await fetch("/api/customer/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: checkoutKey.current, customerNote: note || null }) });
      const body = await response.json();
      if (!response.ok) {
        if (body.code === "PRICE_CHANGED") {
          checkoutKey.current = null;
          const latest = await fetch("/api/customer/cart", { cache: "no-store" }).then((result) => result.json());
          setCart(latest);
        }
        throw new Error(body.error || "Order could not be placed.");
      }
      router.replace(body.destination);
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Order could not be placed." }); }
    finally { setPlacing(false); }
  }

  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-6 pb-32">
      <div className="mx-auto max-w-2xl">
        <Link href="/customer/menu" className="text-sm text-amber-300">← Back to menu</Link>
        <div className="mt-6"><p className="text-[0.68rem] font-semibold tracking-[0.18em] text-amber-400 uppercase">Your seat order</p><h1 className="mt-2 text-3xl font-semibold text-white">Review your cart</h1>{context ? <p className="mt-2 text-sm text-zinc-500">{context.movieTitle} · {context.hallName} · Seat <span className="font-semibold text-amber-300">{context.seatLabel}</span></p> : null}</div>
        {message ? <div role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{message.text}</div> : null}
        {cart.items.length ? <div className="mt-6 space-y-3">
          {cart.items.map((item) => <motion.article layout key={item.productSlug} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            {item.imageUrl ? <div className="relative size-20 shrink-0 overflow-hidden rounded-xl"><Image src={item.imageUrl} alt="" fill sizes="80px" className="object-cover" /></div> : null}
            <div className="min-w-0 flex-1"><h2 className="font-semibold text-white">{item.productName}</h2><p className="mt-1 text-sm text-zinc-500">{money(item.unitPrice, item.currencyCode)} each</p><p className="mt-2 font-semibold text-amber-300">{money(item.lineTotal, item.currencyCode)}</p></div>
            <div className="flex items-center self-center rounded-lg border border-zinc-700 bg-zinc-950">
              <button aria-label="Remove one" disabled={busySlug === item.productSlug} onClick={() => update(item.productSlug, item.quantity - 1)} className="min-h-10 min-w-10">−</button>
              <span className="min-w-7 text-center font-semibold">{item.quantity}</span>
              <button aria-label="Add one" disabled={busySlug === item.productSlug || item.quantity >= 20} onClick={() => update(item.productSlug, item.quantity + 1)} className="min-h-10 min-w-10">+</button>
            </div>
          </motion.article>)}
          <label className="block pt-3 text-sm font-medium text-zinc-300">Note for the cinema (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={3} className="cb-field mt-2 resize-none" placeholder="For example: no ice" /></label>
        </div> : <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center"><h2 className="font-semibold text-white">Your cart is empty</h2><Link href="/customer/menu" className="mt-4 inline-flex text-sm font-semibold text-amber-300">Browse the menu</Link></div>}
      </div>
      {cart.items.length ? <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 p-4 backdrop-blur"><div className="mx-auto flex max-w-2xl items-center gap-4"><div className="min-w-0 flex-1"><p className="text-xs text-zinc-500">Total</p><p className="text-xl font-bold text-white">{money(cart.subtotal, cart.currencyCode)}</p></div><button onClick={checkout} disabled={placing || cart.items.some((item) => item.availability !== "AVAILABLE")} className="cb-button-primary min-w-40">{placing ? "Placing…" : "Place order"}</button></div></div> : null}
    </main>
  );
}

function money(value: string, currency: string | null) {
  if (!currency) return value;
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value)); } catch { return `${value} ${currency}`; }
}
