"use client";

import Link from "next/link";
import { useState } from "react";

import { KitchenOrderDetail } from "@/components/kitchen/kitchen-order-detail";
import { useNotifications } from "@/components/ui/notification-provider";
import { usePolling } from "@/lib/hooks/use-polling";
import { nextOrderStatus, orderActionLabel } from "@/lib/orders/status";
import type { KitchenOrder } from "@/types/order";

export function KitchenDetailClient({ initialOrder }: { initialOrder: KitchenOrder }) {
  const endpoint = `/api/kitchen/orders/${initialOrder.publicOrderCode}`;
  const { data: order, error, refresh } = usePolling(endpoint, initialOrder);
  const [busy, setBusy] = useState(false);
  const notifications = useNotifications();
  async function transition() {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedStatus: order.status, toStatus: nextOrderStatus[order.status] }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The order could not be updated.");
      notifications.success("Order updated.");
    } catch (failure) { notifications.error(failure instanceof Error ? failure.message : "The order could not be updated."); }
    finally { await refresh(); setBusy(false); }
  }
  return <main className="min-h-screen bg-zinc-950 p-4 sm:p-8"><div className="mx-auto max-w-2xl"><Link href="/kitchen" className="text-sm text-amber-300">← Kitchen queue</Link><article className="cb-panel mt-5 p-5 sm:p-7"><KitchenOrderDetail order={order} />{error ? <p role="status" className="mt-4 text-sm text-amber-300">{error}</p> : null}{orderActionLabel[order.status] ? <button disabled={busy} aria-busy={busy} onClick={transition} className="cb-button-primary mt-6 w-full">{busy ? "Updating…" : orderActionLabel[order.status]}</button> : null}</article></div></main>;
}
