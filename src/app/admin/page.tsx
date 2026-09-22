import Link from "next/link";

import { EmptyState } from "@/components/super-admin/empty-state";
import { PageTransition } from "@/components/super-admin/page-transition";
import { StatCard } from "@/components/super-admin/stat-card";
import { StatusBadge } from "@/components/super-admin/status-badge";
import { getTenantDashboard } from "@/server/services/tenant-structure.service";

export default async function AdminOverviewPage() {
  const dashboard = await getTenantDashboard();

  return (
    <PageTransition>
      <header>
        <p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Organization overview</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">{dashboard.organization.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Manage the locations, halls, and seats available to your account.</p>
      </header>
      <section aria-label="Cinema structure statistics" className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Accessible locations" value={dashboard.locations.length} detail="Venues permitted for this account" index={0} />
        <StatCard label="Halls" value={dashboard.totalHalls} detail="Across accessible locations" index={1} />
        <StatCard label="Seats" value={dashboard.totalSeats} detail="Maintained hall seat total" index={2} />
      </section>
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div><h2 className="text-lg font-semibold text-zinc-100">Available locations</h2><p className="mt-1 text-sm text-zinc-500">Only locations allowed by your server-side access profile.</p></div>
          <Link href="/admin/locations" className="text-sm font-medium text-amber-300 hover:text-amber-200">View all</Link>
        </div>
        {dashboard.locations.length === 0 ? (
          <EmptyState title="No accessible locations" description="No cinema locations are currently assigned to your account." />
        ) : (
          <div className="cb-panel divide-y divide-[var(--cb-border)] overflow-hidden">
            {dashboard.locations.slice(0, 5).map((location) => (
              <Link key={location.id} href={`/admin/locations/${location.id}`} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025] sm:px-6">
                <span><span className="block font-medium text-zinc-100">{location.name}</span><span className="mt-1 block text-xs text-zinc-600">{location.city}, {location.country}</span></span>
                <StatusBadge status={location.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageTransition>
  );
}
