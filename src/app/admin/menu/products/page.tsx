import Link from "next/link";

import { MenuProductCards } from "@/components/admin/menu-product-cards";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getMenuWorkspaceData, getProductsForMenu } from "@/server/services/menu.service";

export const metadata = { title: "Menu products" };

export default async function MenuProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const query = { search: typeof raw.search === "string" ? raw.search : "", categoryId: typeof raw.categoryId === "string" && raw.categoryId ? raw.categoryId : undefined, status: typeof raw.status === "string" && raw.status ? raw.status : undefined, locationId: typeof raw.locationId === "string" && raw.locationId ? raw.locationId : undefined, availability: typeof raw.availability === "string" && raw.availability ? raw.availability : undefined, page: typeof raw.page === "string" ? raw.page : "1" };
  const [{ products, total }, workspace] = await Promise.all([getProductsForMenu(query), getMenuWorkspaceData()]);
  const page = Number(query.page) || 1;
  return <PageTransition>
    <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Cinema menu</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Products</h1><p className="mt-2 text-sm text-zinc-400">A bounded, searchable organization catalog.</p></div>{workspace.actor.role === "CINEMA_ADMIN" ? <Link href="/admin/menu/products/new" className="cb-button-primary">Add product</Link> : null}</header>
    <form className="cb-panel mt-7 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-7">
      <label className="text-xs text-zinc-400 xl:col-span-2">Search<input className="cb-field mt-1" name="search" defaultValue={query.search} placeholder="Product name" /></label>
      <label className="text-xs text-zinc-400">Category<select className="cb-field mt-1" name="categoryId" defaultValue={query.categoryId ?? ""}><option value="">All categories</option>{workspace.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Status<select className="cb-field mt-1" name="status" defaultValue={query.status ?? ""}><option value="">All statuses</option><option>ACTIVE</option><option>INACTIVE</option></select></label>
      <label className="text-xs text-zinc-400">Location<select className="cb-field mt-1" name="locationId" defaultValue={query.locationId ?? ""}><option value="">All locations</option>{workspace.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Availability<select className="cb-field mt-1" name="availability" defaultValue={query.availability ?? ""}><option value="">Any</option><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option></select></label>
      <button className="cb-button-secondary self-end">Apply filters</button>
    </form>
    <MenuProductCards products={products} />
    {total > 24 ? <nav aria-label="Product pages" className="mt-6 flex justify-between text-sm"><Link className={page <= 1 ? "pointer-events-none text-zinc-700" : "text-amber-300"} href={`?page=${Math.max(1, page - 1)}`}>Previous</Link><span className="text-zinc-500">Page {page} of {Math.ceil(total / 24)}</span><Link className={page * 24 >= total ? "pointer-events-none text-zinc-700" : "text-amber-300"} href={`?page=${page + 1}`}>Next</Link></nav> : null}
  </PageTransition>;
}
