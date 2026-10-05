"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MenuOrderControls({ productSlug, initialQuantity, disabled }: {
  productSlug: string;
  initialQuantity: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(initialQuantity);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function update(next: number) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/customer/cart", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug, quantity: next }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Cart could not be updated.");
      setQuantity(next); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Cart could not be updated."); }
    finally { setBusy(false); }
  }

  if (disabled) return <span className="rounded-full bg-red-400/10 px-2 py-1 text-[0.62rem] font-semibold text-red-300">OUT OF STOCK</span>;
  return (
    <div className="flex flex-col items-end gap-1">
      {quantity === 0 ? (
        <button type="button" disabled={busy} onClick={() => update(1)} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-zinc-950 disabled:opacity-50">Add</button>
      ) : (
        <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-950">
          <button type="button" aria-label="Remove one" disabled={busy} onClick={() => update(quantity - 1)} className="min-h-9 min-w-9 text-zinc-200">−</button>
          <motion.span key={quantity} initial={{ opacity: 0.5, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="min-w-7 text-center text-sm font-semibold text-white">{quantity}</motion.span>
          <button type="button" aria-label="Add one" disabled={busy || quantity >= 20} onClick={() => update(quantity + 1)} className="min-h-9 min-w-9 text-zinc-200">+</button>
        </div>
      )}
      {message ? <span className="max-w-40 text-right text-[0.62rem] text-red-300">{message}</span> : null}
    </div>
  );
}

export function StickyCartLink({ itemCount, subtotal, currencyCode }: { itemCount: number; subtotal: string; currencyCode: string | null }) {
  if (!itemCount) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur">
      <Link href="/customer/cart" className="mx-auto flex min-h-12 max-w-3xl items-center justify-between rounded-xl bg-amber-400 px-4 font-bold text-zinc-950">
        <span>View cart · {itemCount} {itemCount === 1 ? "item" : "items"}</span>
        <span>{formatPrice(subtotal, currencyCode)}</span>
      </Link>
    </div>
  );
}

function formatPrice(price: string, currencyCode: string | null) {
  if (!currencyCode) return price;
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).format(Number(price)); }
  catch { return `${price} ${currencyCode}`; }
}
