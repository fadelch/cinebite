import Link from "next/link";

import { InventoryItemManager } from "@/components/admin/inventory-item-manager";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getInventoryContext, getInventoryItems } from "@/server/services/inventory.service";

export const metadata = { title: "Inventory items" };

export default async function InventoryItemsPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string; page?: string }> }) {
  const query = await searchParams;
  const [result, context] = await Promise.all([getInventoryItems(query), getInventoryContext()]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <PageTransition><header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Organization catalog</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Inventory items</h1><p className="mt-2 text-sm text-zinc-400">What the cinema stores and consumes, separate from sellable products.</p></div><Link href="/admin/inventory" className="cb-button-secondary">Inventory overview</Link></header>
    <form className="cb-panel mt-7 grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto]"><input name="search" defaultValue={query.search ?? ""} className="cb-field" placeholder="Search name or SKU" aria-label="Search inventory items" /><select name="status" defaultValue={query.status ?? ""} className="cb-field" aria-label="Filter item status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><button className="cb-button-secondary">Apply filters</button></form>
    <InventoryItemManager items={result.items} canEdit={context.actor.role === "CINEMA_ADMIN"} />
    {pages > 1 ? <nav aria-label="Inventory item pagination" className="mt-6 flex justify-center gap-3">{result.page > 1 ? <Link className="cb-button-secondary" href={`?search=${encodeURIComponent(query.search ?? "")}&status=${query.status ?? ""}&page=${result.page - 1}`}>Previous</Link> : null}<span className="px-3 py-2 text-sm text-zinc-500">Page {result.page} of {pages}</span>{result.page < pages ? <Link className="cb-button-secondary" href={`?search=${encodeURIComponent(query.search ?? "")}&status=${query.status ?? ""}&page=${result.page + 1}`}>Next</Link> : null}</nav> : null}
  </PageTransition>;
}
