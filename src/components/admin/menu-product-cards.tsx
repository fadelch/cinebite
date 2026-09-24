"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";

import type { ProductDto } from "@/types/menu";

export function MenuProductCards({ products }: { products: ProductDto[] }) {
  const reduceMotion = useReducedMotion();
  if (!products.length) return <div className="cb-panel mt-7 p-10 text-center"><p className="text-zinc-300">Add your first product to the cinema menu.</p><p className="mt-2 text-sm text-zinc-600">No products match the current filters.</p></div>;
  return <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{products.map((product, index) => <motion.div key={product.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * .035 }}><Link href={`/admin/menu/products/${product.id}`} className="cb-panel group block overflow-hidden transition-colors hover:border-zinc-700">
    <div className="relative aspect-[16/9] bg-zinc-950">{product.imageUrl ? <Image src={product.imageUrl} alt={`${product.name} product`} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center text-sm text-zinc-700">No image</div>}</div>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-zinc-100">{product.name}</h2><p className="mt-1 text-xs text-zinc-500">{product.categoryName}{product.sku ? ` · ${product.sku}` : ""}</p></div><span className="text-[.65rem] text-zinc-400">{product.status}</span></div><p className="mt-4 text-sm text-zinc-500">{product.locations.length} assigned {product.locations.length === 1 ? "location" : "locations"}</p></div>
  </Link></motion.div>)}</div>;
}
