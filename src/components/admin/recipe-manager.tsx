"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useNotifications } from "@/components/ui/notification-provider";
import { formatInventoryQuantity, inventoryUnitLabel } from "@/lib/inventory/format";
import type { InventoryItemDto, RecipeComponentDto } from "@/types/inventory";

async function apiError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : "The recipe could not be updated.";
}

export function RecipeManager({ productId, components, items, canEdit }: {
  productId: string; components: RecipeComponentDto[]; items: InventoryItemDto[]; canEdit: boolean;
}) {
  const router = useRouter(); const notifications = useNotifications(); const reduceMotion = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const available = items.filter((item) => !components.some((component) => component.inventoryItemId === item.id));

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/menu/products/${productId}/recipe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryItemId: data.get("inventoryItemId"), quantityRequired: data.get("quantityRequired") }) });
      if (!response.ok) throw new Error(await apiError(response));
      notifications.success("Recipe component added."); router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The recipe could not be updated."); }
    finally { setBusy(false); }
  }

  async function update(component: RecipeComponentDto, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/menu/products/${productId}/recipe/${component.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantityRequired: data.get("quantityRequired") }) });
      if (!response.ok) throw new Error(await apiError(response));
      notifications.success("Recipe component saved."); router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The recipe could not be updated."); }
    finally { setBusy(false); }
  }

  async function remove(component: RecipeComponentDto) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/menu/products/${productId}/recipe/${component.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await apiError(response));
      notifications.success("Recipe component removed."); router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The recipe could not be updated."); }
    finally { setBusy(false); }
  }

  return <section className="mt-8">
    <div><h2 className="text-xl font-semibold text-zinc-100">Inventory recipe</h2><p className="mt-1 text-sm text-zinc-500">Defines the canonical stock consumed by one sellable unit. Products without components remain not tracked.</p></div>
    {canEdit && available.length ? <form onSubmit={add} className="cb-panel mt-4 grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
      <label className="text-sm text-zinc-300">Inventory item<select name="inventoryItemId" className="cb-field mt-2">{available.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
      <label className="text-sm text-zinc-300">Quantity required<input name="quantityRequired" inputMode="decimal" className="cb-field mt-2" placeholder="1.000" required /></label>
      <button disabled={busy} className="cb-button-primary self-end">Add component</button>
    </form> : null}
    <div className="mt-4 grid gap-3 lg:grid-cols-2"><AnimatePresence initial={false}>{components.map((component) => <motion.article key={component.id} layout initial={reduceMotion ? false : { opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="cb-panel p-5">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-zinc-100">{component.itemName}</h3><p className="mt-1 font-mono text-xs text-zinc-500">{component.sku}</p></div><span className="text-sm text-zinc-300">{formatInventoryQuantity(component.quantityRequired)} {inventoryUnitLabel[component.unit]}</span></div>
      {canEdit ? <form onSubmit={(event) => update(component, event)} className="mt-4 flex flex-col gap-3 sm:flex-row"><input aria-label={`Quantity of ${component.itemName}`} name="quantityRequired" defaultValue={component.quantityRequired} inputMode="decimal" className="cb-field" required /><button disabled={busy} className="cb-button-secondary shrink-0">Save</button><button type="button" disabled={busy} onClick={() => void remove(component)} className="cb-button-danger shrink-0">Remove</button></form> : null}
    </motion.article>)}</AnimatePresence></div>
    {components.length === 0 ? <div className="cb-panel mt-4 p-7 text-sm text-zinc-500">Inventory availability is <strong className="text-zinc-300">not tracked</strong> until a recipe component is added.</div> : null}
  </section>;
}
