import Link from "next/link";

import { LocationForm } from "@/components/admin/location-form";
import { PageTransition } from "@/components/super-admin/page-transition";
import { requirePageRole } from "@/server/auth/page-guards";

export const metadata = { title: "Add location" };

export default async function NewLocationPage() {
  await requirePageRole(["CINEMA_ADMIN"]);
  return (
    <PageTransition>
      <Link href="/admin/locations" className="text-sm text-zinc-500 hover:text-zinc-200">← Locations</Link>
      <header className="mt-6"><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">New venue</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Create location</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">The location is automatically attached to your authenticated organization. Organization selection is intentionally unavailable.</p></header>
      <LocationForm />
    </PageTransition>
  );
}
