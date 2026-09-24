"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { CurrencyCodeOptions } from "@/components/admin/currency-code-options";
import { slugify } from "@/lib/super-admin/slug";
import type { MenuCategoryDto } from "@/types/menu";

type LocationOption = { id: string; name: string; status: string };

export function MenuProductForm({ categories, locations }: { categories: MenuCategoryDto[]; locations: LocationOption[] }) {
  const router = useRouter(); const reduceMotion = useReducedMotion();
  const [name, setName] = useState(""); const [slug, setSlug] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const values = new FormData(event.currentTarget);
    const payload = {
      name, slug, categoryId: String(values.get("categoryId")), description: String(values.get("description")), sku: String(values.get("sku") || "") || null,
      status: String(values.get("status")), sortOrder: Number(values.get("sortOrder")),
      locations: locations.filter((location) => selected[location.id]).map((location) => ({ locationId: location.id, price: String(values.get(`price-${location.id}`)), currencyCode: String(values.get(`currency-${location.id}`)), isAvailable: values.get(`available-${location.id}`) === "on" })),
    };
    const body = new FormData(); body.set("payload", JSON.stringify(payload)); const image = values.get("image"); if (image instanceof File && image.size) body.set("image", image);
    try {
      const response = await fetch("/api/admin/menu/products", { method: "POST", body }); const json: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(productResponseMessage(json));
      const id = typeof json === "object" && json && "product" in json && typeof json.product === "object" && json.product && "id" in json.product ? String(json.product.id) : "";
      router.push(id ? `/admin/menu/products/${id}` : "/admin/menu/products"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The product could not be created."); setBusy(false); }
  }

  if (!categories.length) return <div className="cb-panel mt-7 p-8 text-center text-zinc-400">Create an active menu category before adding products.</div>;
  return <motion.form onSubmit={submit} className="mt-7 space-y-6" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <fieldset disabled={busy} className="cb-panel grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
      <legend className="px-2 font-semibold text-zinc-100">Product identity</legend>
      <Field label="Name"><input className="cb-field" value={name} required onChange={(event) => { setName(event.target.value); setSlug(slugify(event.target.value)); }} /></Field>
      <Field label="Slug"><input className="cb-field font-mono text-sm" value={slug} required onChange={(event) => setSlug(event.target.value)} /></Field>
      <Field label="Category"><select name="categoryId" className="cb-field" required>{categories.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="SKU (optional)"><input name="sku" className="cb-field uppercase" maxLength={40} /></Field>
      <Field label="Status"><select name="status" className="cb-field"><option>ACTIVE</option><option>INACTIVE</option></select></Field>
      <Field label="Sort order"><input name="sortOrder" type="number" min={0} max={10000} defaultValue={0} className="cb-field" required /></Field>
      <Field label="Description" wide><textarea name="description" className="cb-field min-h-28" maxLength={2000} required /></Field>
      <div className="sm:col-span-2">
        <label htmlFor="product-image" className="text-sm font-medium text-zinc-300">Product image (optional; JPEG, PNG, or WebP; max 5 MB)</label>
        <input ref={imageInputRef} id="product-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" className="cb-field mt-2" onChange={(event) => setSelectedImageName(event.target.files?.[0]?.name ?? null)} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-normal text-zinc-500">{selectedImageName ? `Selected: ${selectedImageName}` : "You can leave this empty and add an image later."}</span>
          {selectedImageName ? <button type="button" className="text-xs font-medium text-red-300 hover:text-red-200" onClick={() => { if (imageInputRef.current) imageInputRef.current.value = ""; setSelectedImageName(null); }}>Remove selected image</button> : null}
        </div>
      </div>
    </fieldset>
    <fieldset disabled={busy} className="cb-panel p-5 sm:p-7"><legend className="px-2 font-semibold text-zinc-100">Location offers</legend><p className="mb-5 text-sm text-zinc-500">Select only locations that sell this product. Choose a suggested currency or type any three-letter code manually.</p><div className="space-y-3">{locations.map((location) => <div key={location.id} className="grid items-center gap-3 rounded-xl border border-zinc-800 p-4 sm:grid-cols-[1fr_9rem_7rem_auto]"><label className="flex items-center gap-3 text-sm font-medium text-zinc-200"><input type="checkbox" checked={Boolean(selected[location.id])} onChange={(event) => setSelected((current) => ({ ...current, [location.id]: event.target.checked }))} />{location.name}</label><input aria-label={`${location.name} price`} name={`price-${location.id}`} className="cb-field" defaultValue="0.00" inputMode="decimal" disabled={!selected[location.id]} required={selected[location.id]} /><input aria-label={`${location.name} currency code`} name={`currency-${location.id}`} list="new-product-currency-codes" className="cb-field uppercase" defaultValue="USD" maxLength={3} pattern="[A-Za-z]{3}" autoCapitalize="characters" spellCheck={false} disabled={!selected[location.id]} required={selected[location.id]} title="Choose a suggested currency or type any three-letter currency code." /><label className="flex items-center gap-2 text-sm text-zinc-400"><input name={`available-${location.id}`} type="checkbox" defaultChecked disabled={!selected[location.id]} /> Available</label></div>)}</div><CurrencyCodeOptions id="new-product-currency-codes" /></fieldset>
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}<div className="flex justify-end gap-3"><button type="button" className="cb-button-secondary" disabled={busy} onClick={() => router.back()}>Cancel</button><button className="cb-button-primary" disabled={busy}>{busy ? "Creating product…" : "Create product"}</button></div>
  </motion.form>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={`text-sm font-medium text-zinc-300 ${wide ? "sm:col-span-2" : ""}`}>{label}<span className="mt-2 block">{children}</span></label>; }

function productResponseMessage(body: unknown): string {
  if (typeof body !== "object" || body === null) return "The product could not be created.";
  if ("issues" in body && Array.isArray(body.issues)) {
    const issue = body.issues[0];
    if (typeof issue === "object" && issue !== null && "message" in issue && typeof issue.message === "string") {
      const field = "path" in issue && typeof issue.path === "string" && issue.path ? `${issue.path}: ` : "";
      return `${field}${issue.message}`;
    }
  }
  return "error" in body && typeof body.error === "string" ? body.error : "The product could not be created.";
}
