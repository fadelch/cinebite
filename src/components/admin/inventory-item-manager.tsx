"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useNotifications } from "@/components/ui/notification-provider";
import type { InventoryItemDto } from "@/types/inventory";

async function responseError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export function InventoryItemManager({ items, canEdit }: { items: InventoryItemDto[]; canEdit: boolean }) {
  const router = useRouter();
  const notifications = useNotifications();
  const reduceMotion = useReducedMotion();
  const [busy, setBusy] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("new");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/inventory/items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), sku: data.get("sku"), unit: data.get("unit"), status: "ACTIVE" }),
      });
      if (!response.ok) throw new Error(await responseError(response, "The inventory item could not be created."));
      notifications.success("Inventory item created successfully.");
      router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The inventory item could not be created."); }
    finally { setBusy(null); }
  }

  async function update(item: InventoryItemDto, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(item.id);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/inventory/items/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), sku: data.get("sku"), unit: data.get("unit") ?? item.unit, status: data.get("status") }),
      });
      if (!response.ok) throw new Error(await responseError(response, "The inventory item could not be saved."));
      notifications.success("Inventory item saved successfully.");
      router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The inventory item could not be saved."); }
    finally { setBusy(null); }
  }

  return <div className="mt-6 space-y-5">
    {canEdit ? <form onSubmit={create} className="cb-panel grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm text-zinc-300">Name<input name="name" className="cb-field mt-2" placeholder="Popcorn kernels" required /></label>
      <label className="text-sm text-zinc-300">SKU<input name="sku" className="cb-field mt-2 uppercase" placeholder="INV-POPCORN-KERNEL" required /></label>
      <label className="text-sm text-zinc-300">Canonical unit<select name="unit" className="cb-field mt-2"><option value="EACH">Each</option><option value="GRAM">Gram</option><option value="MILLILITER">Milliliter</option></select></label>
      <button disabled={busy !== null} className="cb-button-primary self-end">{busy === "new" ? "Creating…" : "Create item"}</button>
    </form> : <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">You can view the organization catalog. Only a Cinema Administrator can change item definitions.</div>}
    {items.length === 0 ? <div className="cb-panel p-10 text-center text-sm text-zinc-500">No inventory items match this view.</div> : <div className="grid gap-4 lg:grid-cols-2">{items.map((item, index) => <motion.article key={item.id} className="cb-panel p-5" initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * .03 }}>
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-zinc-100">{item.name}</h2><p className="mt-1 font-mono text-xs text-zinc-500">{item.sku}</p></div><span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[.65rem] text-zinc-300">{item.status}</span></div>
      <p className="mt-4 text-sm text-zinc-400">Stored in canonical <strong className="text-zinc-200">{item.unit}</strong> units.</p>
      {item.usageLocked ? <p className="mt-2 text-xs text-amber-200/80">Unit locked because stock or recipe usage exists.</p> : null}
      {canEdit ? <details className="mt-5 rounded-xl border border-zinc-800 p-3"><summary className="cursor-pointer text-sm font-medium text-amber-300">Edit item</summary><form onSubmit={(event) => update(item, event)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">Name<input name="name" defaultValue={item.name} className="cb-field mt-1" required /></label>
        <label className="text-xs text-zinc-400">SKU<input name="sku" defaultValue={item.sku} className="cb-field mt-1 uppercase" required /></label>
        <label className="text-xs text-zinc-400">Unit<select name="unit" defaultValue={item.unit} disabled={item.usageLocked} className="cb-field mt-1"><option value="EACH">Each</option><option value="GRAM">Gram</option><option value="MILLILITER">Milliliter</option></select></label>
        <label className="text-xs text-zinc-400">Status<select name="status" defaultValue={item.status} className="cb-field mt-1"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
        <button disabled={busy !== null} className="cb-button-primary sm:col-start-2">Save item</button>
      </form></details> : null}
    </motion.article>)}</div>}
  </div>;
}
