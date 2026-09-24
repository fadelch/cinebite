import Link from "next/link";

import { PageTransition } from "@/components/super-admin/page-transition";
import { StatCard } from "@/components/super-admin/stat-card";
import { getMenuOverview } from "@/server/services/menu.service";

export const metadata = { title: "Menu" };

export default async function MenuOverviewPage() {
  const overview = await getMenuOverview();
  return <PageTransition>
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Cinema menu</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Menu management</h1><p className="mt-2 text-sm text-zinc-400">Organization products with location-specific prices and availability.</p></div>
      <div className="flex gap-3"><Link className="cb-button-secondary" href="/admin/menu/categories">Categories</Link><Link className="cb-button-primary" href="/admin/menu/products/new">Add product</Link></div>
    </header>
    <section aria-label="Menu statistics" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Categories" value={overview.categoryCount} detail="Organization-wide" index={0} />
      <StatCard label="Products" value={overview.productCount} detail="Total catalog" index={1} />
      <StatCard label="Active" value={overview.activeProductCount} detail="Catalog enabled" index={2} />
      <StatCard label="Inactive" value={overview.inactiveProductCount} detail="Soft disabled" index={3} />
      <StatCard label="Limited" value={overview.partiallyUnavailableCount} detail="Unavailable somewhere" index={4} />
    </section>
    <section className="mt-8 cb-panel p-5 sm:p-6">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold text-zinc-100">Recently updated</h2><p className="mt-1 text-sm text-zinc-500">Latest catalog changes.</p></div><Link href="/admin/menu/products" className="text-sm text-amber-300">View products</Link></div>
      {overview.recentProducts.length ? <div className="mt-5 divide-y divide-zinc-800">{overview.recentProducts.map((product) => <Link key={product.id} href={`/admin/menu/products/${product.id}`} className="flex items-center justify-between gap-4 py-4"><span><span className="block font-medium text-zinc-200">{product.name}</span><span className="text-xs text-zinc-500">{product.categoryName} · {product.locations.length} locations</span></span><span className="text-xs text-zinc-400">{product.status}</span></Link>)}</div> : <p className="mt-5 text-sm text-zinc-500">Add your first product to the cinema menu.</p>}
    </section>
  </PageTransition>;
}
