"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent } from "react";

import { slugify } from "@/lib/super-admin/slug";
import type { MenuCategoryDto } from "@/types/menu";

async function readError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : "The category could not be saved.";
}

export function MenuCategoryManager({ initialCategories, canEdit }: { initialCategories: MenuCategoryDto[]; canEdit: boolean }) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("new"); setError(null);
    const data = new FormData(event.currentTarget);
    const payload = { name, slug, description: String(data.get("description") ?? ""), status: "ACTIVE", sortOrder: Number(data.get("sortOrder")) };
    try {
      const response = await fetch("/api/admin/menu/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json() as { category: MenuCategoryDto };
      setCategories((current) => [...current, body.category].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setName(""); setSlug(""); event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The category could not be saved."); }
    finally { setBusy(null); }
  }

  async function update(category: MenuCategoryDto, input: Partial<MenuCategoryDto>) {
    setBusy(category.id); setError(null);
    try {
      const response = await fetch(`/api/admin/menu/categories/${category.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json() as { category: MenuCategoryDto };
      setCategories((current) => current.map((item) => item.id === category.id ? body.category : item).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The category could not be saved."); }
    finally { setBusy(null); }
  }

  function saveDetails(category: MenuCategoryDto, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void update(category, {
      name: String(data.get("name")),
      slug: String(data.get("slug")),
      description: String(data.get("description") || "") || null,
      sortOrder: Number(data.get("sortOrder")),
    });
  }

  return <div className="mt-7 space-y-5">
    {canEdit ? <form onSubmit={create} className="cb-panel grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm text-zinc-300">Name<input className="cb-field mt-2" value={name} required onChange={(event) => { setName(event.target.value); setSlug(slugify(event.target.value)); }} /></label>
      <label className="text-sm text-zinc-300">Slug<input className="cb-field mt-2 font-mono text-sm" value={slug} required onChange={(event) => setSlug(event.target.value)} /></label>
      <label className="text-sm text-zinc-300 xl:col-span-2">Description<input name="description" className="cb-field mt-2" maxLength={500} /></label>
      <label className="text-sm text-zinc-300">Sort order<input name="sortOrder" type="number" min={0} max={10000} defaultValue={categories.length * 10} className="cb-field mt-2" required /></label>
      <button disabled={busy !== null} className="cb-button-primary sm:col-start-2 xl:col-start-5">{busy === "new" ? "Creating…" : "Create category"}</button>
    </form> : <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">You can view categories. Only a Cinema Administrator can change the global catalog.</div>}
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
    {categories.length === 0 ? <div className="cb-panel p-8 text-center text-sm text-zinc-500">Create your first menu category.</div> : <div className="grid gap-4 lg:grid-cols-2">{categories.map((category, index) => <motion.article key={category.id} className="cb-panel p-5" initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * .035 }}>
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-zinc-100">{category.name}</h2><p className="mt-1 font-mono text-xs text-zinc-600">/{category.slug}</p></div><span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[.65rem] text-zinc-300">{category.status}</span></div>
      <p className="mt-4 min-h-10 text-sm text-zinc-400">{category.description || "No description."}</p><p className="mt-3 text-xs text-zinc-600">Order {category.sortOrder} · {category.productCount} products</p>
      {canEdit ? <div className="mt-5"><details className="rounded-xl border border-zinc-800 p-3"><summary className="cursor-pointer text-sm font-medium text-amber-300">Edit category details</summary><form onSubmit={(event) => saveDetails(category, event)} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Name<input name="name" defaultValue={category.name} className="cb-field mt-1" required /></label><label className="text-xs text-zinc-400">Slug<input name="slug" defaultValue={category.slug} className="cb-field mt-1 font-mono" required /></label><label className="text-xs text-zinc-400 sm:col-span-2">Description<textarea name="description" defaultValue={category.description ?? ""} className="cb-field mt-1 min-h-20" maxLength={500} /></label><label className="text-xs text-zinc-400">Sort order<input name="sortOrder" type="number" min={0} max={10000} defaultValue={category.sortOrder} className="cb-field mt-1" required /></label><button disabled={busy !== null} className="cb-button-primary self-end">Save details</button></form></details><button disabled={busy !== null} className={`${category.status === "ACTIVE" ? "cb-button-danger" : "cb-button-secondary"} mt-3`} onClick={() => void update(category, { status: category.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>{category.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></div> : null}
    </motion.article>)}</div>}
  </div>;
}
