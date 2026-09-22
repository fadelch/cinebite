import Link from "next/link";
import { notFound } from "next/navigation";

import { LocationHalls } from "@/components/admin/location-halls";
import { PageTransition } from "@/components/super-admin/page-transition";
import { StatusBadge } from "@/components/super-admin/status-badge";
import { toHallDto } from "@/lib/tenant-admin/dto";
import { getTenantLocationDetail } from "@/server/services/tenant-structure.service";

export const metadata = { title: "Location details" };

export default async function AdminLocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const detail = await getTenantLocationDetail(locationId);
  if (!detail) notFound();
  return (
    <PageTransition>
      <Link href="/admin/locations" className="text-sm text-zinc-500 hover:text-zinc-200">← Locations</Link>
      <header className="mt-6 flex flex-wrap items-start justify-between gap-5">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold text-zinc-50">{detail.location.name}</h1><StatusBadge status={detail.location.status} /></div><p className="mt-3 text-sm text-zinc-400">{detail.location.address.line1}, {detail.location.city}, {detail.location.country}</p><p className="mt-2 font-mono text-xs text-zinc-600">{detail.location.slug} · {detail.location.timezone}</p></div>
      </header>
      {detail.location.status !== "ACTIVE" ? <div className="mt-7 rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] px-5 py-4 text-sm text-amber-100/80">This location is inactive. Its structure is preserved but cannot be changed.</div> : null}
      <section className="mt-9">
        <LocationHalls locationId={detail.location.id} locationActive={detail.location.status === "ACTIVE"} halls={detail.halls.map(toHallDto)} />
      </section>
    </PageTransition>
  );
}
