"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { StockStatusBadge } from "@/components/admin/stock-status-badge";
import { useNotifications } from "@/components/ui/notification-provider";
import { formatInventoryQuantity, inventoryUnitLabel } from "@/lib/inventory/format";
import type { LocationInventoryDto } from "@/types/inventory";

type AvailableItem = { id: string; name: string; sku: string; unit: "EACH" | "GRAM" | "MILLILITER" };

async function apiMessage(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export function LocationInventoryManager({ locationId, inventory, availableItems }: {
  locationId: string; inventory: LocationInventoryDto[]; availableItems: AvailableItem[];
}) {
  const router = useRouter();
  const notifications = useNotifications();
  const reduceMotion = useReducedMotion();
  const [busy, setBusy] = useState<string | null>(null);

  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("configure"); const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/inventory/locations/${locationId}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryItemId: data.get("inventoryItemId"), lowStockThreshold: data.get("lowStockThreshold") }) });
      if (!response.ok) throw new Error(await apiMessage(response, "The item could not be configured."));
      notifications.success("Location inventory configured successfully."); router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The item could not be configured."); }
    finally { setBusy(null); }
  }

  async function threshold(item: LocationInventoryDto, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(item.id); const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/inventory/locations/${locationId}/items/${item.id}/threshold`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lowStockThreshold: data.get("lowStockThreshold") }) });
      if (!response.ok) throw new Error(await apiMessage(response, "The threshold could not be saved."));
      notifications.success("Low-stock threshold saved."); router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The threshold could not be saved."); }
    finally { setBusy(null); }
  }

  async function movement(item: LocationInventoryDto, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(item.id); const data = new FormData(event.currentTarget);
    const type = String(data.get("type"));
    try {
      const response = await fetch(`/api/admin/inventory/locations/${locationId}/items/${item.id}/movements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, quantity: data.get("quantity"), reason: data.get("reason"), note: data.get("note") }) });
      if (!response.ok) throw new Error(await apiMessage(response, "The stock change could not be completed."));
      const labels: Record<string, string> = { RECEIVE: "Stock received.", ADJUSTMENT_IN: "Positive adjustment recorded.", ADJUSTMENT_OUT: "Stock reduction recorded.", WASTE: "Waste recorded." };
      notifications.success(labels[type] ?? "Stock updated."); router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The stock change could not be completed."); }
    finally { setBusy(null); }
  }

  return <div className="mt-7 space-y-5">
    {availableItems.length ? <form onSubmit={configure} className="cb-panel grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
      <label className="text-sm text-zinc-300">Inventory item<select name="inventoryItemId" className="cb-field mt-2">{availableItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku} · {item.unit}</option>)}</select></label>
      <label className="text-sm text-zinc-300">Low-stock threshold<input name="lowStockThreshold" inputMode="decimal" defaultValue="0.000" className="cb-field mt-2" required /></label>
      <button disabled={busy !== null} className="cb-button-primary self-end">Configure item</button>
    </form> : null}
    {inventory.length === 0 ? <div className="cb-panel p-10 text-center"><h2 className="font-semibold text-zinc-100">No stock configured</h2><p className="mt-2 text-sm text-zinc-500">Add an active organization inventory item to begin tracking this location.</p></div> : <div className="grid gap-4 xl:grid-cols-2">{inventory.map((item, index) => <motion.article key={item.id} className="cb-panel p-5 sm:p-6" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * .035 }}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-zinc-100">{item.itemName}</h2><p className="mt-1 font-mono text-xs text-zinc-500">{item.sku}</p></div><StockStatusBadge status={item.stockStatus} /></div>
      <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-zinc-800 bg-black/20 p-4"><p className="text-xs text-zinc-500">On hand</p><p className="mt-1 text-2xl font-semibold text-zinc-100">{formatInventoryQuantity(item.quantityOnHand)} <span className="text-sm font-normal text-zinc-500">{inventoryUnitLabel[item.unit]}</span></p></div><div className="rounded-xl border border-zinc-800 bg-black/20 p-4"><p className="text-xs text-zinc-500">Low at</p><p className="mt-1 text-2xl font-semibold text-zinc-100">{formatInventoryQuantity(item.lowStockThreshold)} <span className="text-sm font-normal text-zinc-500">{inventoryUnitLabel[item.unit]}</span></p></div></div>
      <details className="mt-4 rounded-xl border border-zinc-800 p-3"><summary className="cursor-pointer text-sm font-medium text-amber-300">Receive, adjust, or record waste</summary><form onSubmit={(event) => movement(item, event)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">Action<select name="type" className="cb-field mt-1"><option value="RECEIVE">Receive stock</option><option value="ADJUSTMENT_IN">Adjustment in</option><option value="ADJUSTMENT_OUT">Adjustment out</option><option value="WASTE">Record waste</option></select></label>
        <label className="text-xs text-zinc-400">Quantity ({inventoryUnitLabel[item.unit]})<input name="quantity" inputMode="decimal" placeholder="0.000" className="cb-field mt-1" required /></label>
        <label className="text-xs text-zinc-400">Reason<input name="reason" maxLength={160} className="cb-field mt-1" placeholder="Required for reductions" /></label>
        <label className="text-xs text-zinc-400">Note<input name="note" maxLength={500} className="cb-field mt-1" /></label>
        <button disabled={busy !== null} className="cb-button-primary sm:col-start-2">Record stock movement</button>
      </form></details>
      <details className="mt-3 rounded-xl border border-zinc-800 p-3"><summary className="cursor-pointer text-sm font-medium text-zinc-300">Change low-stock threshold</summary><form onSubmit={(event) => threshold(item, event)} className="mt-4 flex flex-col gap-3 sm:flex-row"><input aria-label="Low-stock threshold" name="lowStockThreshold" defaultValue={item.lowStockThreshold} inputMode="decimal" className="cb-field" required /><button disabled={busy !== null} className="cb-button-secondary shrink-0">Save threshold</button></form></details>
      <Link href={`/admin/inventory/movements?locationId=${locationId}&inventoryItemId=${item.inventoryItemId}`} className="mt-4 inline-flex text-sm font-medium text-amber-300 hover:text-amber-200">View movement history →</Link>
    </motion.article>)}</div>}
  </div>;
}
