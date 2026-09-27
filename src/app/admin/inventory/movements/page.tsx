import Link from "next/link";

import { PageTransition } from "@/components/super-admin/page-transition";
import { formatInventoryQuantity, inventoryUnitLabel, movementTypeLabel } from "@/lib/inventory/format";
import { getInventoryMovements, getInventoryWorkspace } from "@/server/services/inventory.service";

export const metadata = { title: "Inventory movement history" };

type MovementSearchParams = {
  locationId?: string;
  inventoryItemId?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: string;
};

function movementHref(query: MovementSearchParams, page: number) {
  const params = new URLSearchParams();
  for (const key of ["locationId", "inventoryItemId", "type", "from", "to"] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  params.set("page", String(page));
  return `?${params.toString()}`;
}

export default async function InventoryMovementsPage({ searchParams }: { searchParams: Promise<MovementSearchParams> }) {
  const query = await searchParams;
  const [result, workspace] = await Promise.all([
    getInventoryMovements(query),
    getInventoryWorkspace(),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return <PageTransition>
    <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Audit trail</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Inventory movements</h1><p className="mt-2 text-sm text-zinc-400">Immutable receipts, adjustments, and waste records across your permitted locations.</p></div><Link href="/admin/inventory" className="cb-button-secondary">Inventory overview</Link></header>
    <form className="cb-panel mt-7 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
      <select name="locationId" defaultValue={query.locationId ?? ""} className="cb-field" aria-label="Filter by location"><option value="">All permitted locations</option>{workspace.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
      <select name="inventoryItemId" defaultValue={query.inventoryItemId ?? ""} className="cb-field" aria-label="Filter by item"><option value="">All active items</option>{workspace.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select name="type" defaultValue={query.type ?? ""} className="cb-field" aria-label="Filter by movement type"><option value="">All movement types</option><option value="RECEIVE">Receive</option><option value="ADJUSTMENT_IN">Adjustment in</option><option value="ADJUSTMENT_OUT">Adjustment out</option><option value="WASTE">Waste</option></select>
      <input name="from" type="date" defaultValue={query.from ?? ""} className="cb-field" aria-label="Movements from date" />
      <input name="to" type="date" defaultValue={query.to ?? ""} className="cb-field" aria-label="Movements through date" />
      <button className="cb-button-secondary">Apply filters</button>
    </form>
    <div className="cb-panel mt-6 overflow-x-auto"><table className="w-full min-w-[58rem] text-left text-sm"><thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Item</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Quantity</th><th className="px-5 py-3">Reason / note</th><th className="px-5 py-3">Actor</th></tr></thead><tbody className="divide-y divide-zinc-800">{result.movements.map((movement) => <tr key={movement.id}><td className="whitespace-nowrap px-5 py-4 text-zinc-400">{new Date(movement.createdAt).toLocaleString()}</td><td className="px-5 py-4 text-zinc-300">{movement.locationName}</td><td className="px-5 py-4 font-medium text-zinc-100">{movement.itemName}</td><td className="px-5 py-4 text-zinc-300">{movementTypeLabel[movement.type]}</td><td className={`px-5 py-4 font-mono ${movement.quantityDelta.startsWith("-") ? "text-red-300" : "text-emerald-300"}`}>{movement.quantityDelta.startsWith("-") ? "" : "+"}{formatInventoryQuantity(movement.quantityDelta)} {inventoryUnitLabel[movement.unit]}</td><td className="max-w-xs px-5 py-4 text-zinc-400">{[movement.reason, movement.note].filter(Boolean).join(" — ") || "—"}</td><td className="px-5 py-4 text-zinc-400">{movement.actorDisplayName}</td></tr>)}</tbody></table>{result.movements.length === 0 ? <p className="p-10 text-center text-sm text-zinc-500">No movements match these filters.</p> : null}</div>
    {pages > 1 ? <nav aria-label="Movement pagination" className="mt-6 flex items-center justify-center gap-3">{result.page > 1 ? <Link className="cb-button-secondary" href={movementHref(query, result.page - 1)}>Previous</Link> : null}<span className="px-3 py-2 text-sm text-zinc-500">Page {result.page} of {pages}</span>{result.page < pages ? <Link className="cb-button-secondary" href={movementHref(query, result.page + 1)}>Next</Link> : null}</nav> : null}
  </PageTransition>;
}
