"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useNotifications } from "@/components/ui/notification-provider";

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100); }
async function apiMessage(response: Response) { const body: unknown = await response.json().catch(() => null); return typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : "The movie could not be created."; }

export function MovieForm() {
  const router = useRouter(); const notifications = useNotifications();
  const [busy, setBusy] = useState(false); const [title, setTitle] = useState(""); const [slug, setSlug] = useState(""); const [slugTouched, setSlugTouched] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget);
    const body = new FormData();
    body.set("payload", JSON.stringify({ title: data.get("title"), slug: data.get("slug"), synopsis: data.get("synopsis"), durationMinutes: data.get("durationMinutes"), language: data.get("language"), contentRating: data.get("contentRating"), status: data.get("status") }));
    const poster = data.get("poster"); if (poster instanceof File && poster.size) body.set("poster", poster);
    try {
      const response = await fetch("/api/admin/movies", { method: "POST", body });
      if (!response.ok) throw new Error(await apiMessage(response));
      notifications.success("Movie created successfully."); router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The movie could not be created."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="cb-panel mt-7 grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
    <label className="text-sm text-zinc-300">Title<input name="title" value={title} onChange={(event) => { setTitle(event.target.value); if (!slugTouched) setSlug(slugify(event.target.value)); }} className="cb-field mt-2" placeholder="Interstellar" required /></label>
    <label className="text-sm text-zinc-300">Slug<input name="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(event.target.value); }} className="cb-field mt-2 font-mono" placeholder="interstellar" required /></label>
    <label className="text-sm text-zinc-300">Runtime in minutes<input name="durationMinutes" type="number" min={1} max={600} className="cb-field mt-2" placeholder="169" required /></label>
    <label className="text-sm text-zinc-300">Language (optional)<input name="language" maxLength={80} className="cb-field mt-2" placeholder="English" /></label>
    <label className="text-sm text-zinc-300">Content rating (optional)<input name="contentRating" maxLength={30} className="cb-field mt-2" placeholder="PG-13" /></label>
    <label className="text-sm text-zinc-300">Status<select name="status" defaultValue="ACTIVE" className="cb-field mt-2"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
    <label className="text-sm text-zinc-300 sm:col-span-2">Synopsis (optional)<textarea name="synopsis" maxLength={4000} className="cb-field mt-2 min-h-32" /></label>
    <label className="text-sm text-zinc-300 sm:col-span-2">Poster (optional, JPEG/PNG/WebP, max 5 MB)<input name="poster" type="file" accept="image/jpeg,image/png,image/webp" className="cb-field mt-2 text-xs" /></label>
    <button disabled={busy} className="cb-button-primary sm:col-start-2">{busy ? "Creating…" : "Create movie"}</button>
  </form>;
}
