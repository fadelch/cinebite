import Image from "next/image";
import { cookies } from "next/headers";

import { EndSessionButton } from "@/components/customer/end-session-button";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { getCustomerMenu } from "@/server/services/customer-menu.service";
import type { CustomerMenuContext } from "@/types/customer-menu";

export const metadata = { title: "Your cinema menu | CineBite" };

async function loadMenu(token: string | undefined): Promise<CustomerMenuContext | null> {
  try {
    return await getCustomerMenu(token);
  } catch {
    return null;
  }
}

export default async function CustomerMenuPage() {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const menu = await loadMenu(token);
  if (!menu) return <SessionEnded />;
  return (
    <main className="min-h-screen bg-[#09090b] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold tracking-[0.18em] text-amber-400 uppercase">Now showing</p>
            <h1 className="truncate text-lg font-semibold text-white">{menu.movieTitle}</h1>
            <p className="truncate text-xs text-zinc-500">{menu.locationName} · {menu.hallName} · Seat <span className="font-semibold text-amber-300">{menu.seatLabel}</span></p>
          </div>
          <EndSessionButton />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-7">
        {menu.categories.length ? menu.categories.map((category) => (
          <section key={category.slug}>
            <div className="mb-4 flex items-end justify-between">
              <div><p className="text-[0.65rem] tracking-[0.16em] text-zinc-600 uppercase">Fresh from concessions</p><h2 className="mt-1 text-2xl font-semibold text-zinc-50">{category.name}</h2></div>
              <span className="text-xs text-zinc-600">{category.products.length} items</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {category.products.map((product) => (
                <article key={product.slug} className={`flex min-h-32 gap-4 rounded-2xl border p-4 ${product.availability === "OUT_OF_STOCK" ? "border-zinc-800 bg-zinc-900/45 opacity-65" : "border-zinc-800 bg-zinc-900/85"}`}>
                  {product.imageUrl ? <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-zinc-800"><Image src={product.imageUrl} alt="" fill sizes="96px" className="object-cover" /></div> : <div className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-3xl" aria-hidden="true">🍿</div>}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="font-semibold text-zinc-100">{product.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{product.description}</p>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <p className="text-base font-bold text-amber-300">{formatPrice(product.price, product.currencyCode)}</p>
                      {product.availability === "OUT_OF_STOCK" ? <span className="rounded-full bg-red-400/10 px-2 py-1 text-[0.62rem] font-semibold text-red-300">OUT OF STOCK</span> : <span className="text-[0.62rem] font-medium text-emerald-400">AVAILABLE</span>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )) : <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center"><h2 className="font-semibold text-white">Menu coming soon</h2><p className="mt-2 text-sm text-zinc-500">There are no available products for this cinema location yet.</p></section>}
        <p className="text-center text-xs leading-5 text-zinc-600">Prices and availability come directly from this cinema location. Ordering will be added in the next phase.</p>
      </div>
    </main>
  );
}

function SessionEnded() {
  return <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-4"><section className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-7 text-center"><h1 className="text-2xl font-semibold text-white">Your seat session has ended</h1><p className="mt-3 text-sm leading-6 text-zinc-500">Scan the QR at your seat again while a screening is live.</p></section></main>;
}

function formatPrice(price: string, currencyCode: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).format(Number(price)); }
  catch { return `${price} ${currencyCode}`; }
}
