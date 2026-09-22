import Link from "next/link";

import { EmptyState } from "@/components/super-admin/empty-state";
import { PageTransition } from "@/components/super-admin/page-transition";
import { StatCard } from "@/components/super-admin/stat-card";
import { StatusBadge } from "@/components/super-admin/status-badge";
import { formatDashboardDate } from "@/lib/super-admin/format";
import { getDashboardForSuperAdmin } from "@/server/services/organization-management.service";

export default async function SuperAdminOverviewPage() {
  const dashboard = await getDashboardForSuperAdmin();

  return (
    <PageTransition>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">
            Platform overview
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Super Admin dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Monitor cinema tenants and onboard new organizations from one secure
            control plane.
          </p>
        </div>
        <Link href="/super-admin/organizations/new" className="cb-button-primary">
          Add organization
        </Link>
      </header>

      <section
        aria-label="Organization statistics"
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard label="Total organizations" value={dashboard.totalOrganizations} detail="All registered cinema tenants" index={0} />
        <StatCard label="Active" value={dashboard.activeOrganizations} detail="Organizations currently operational" tone="success" index={1} />
        <StatCard label="Suspended" value={dashboard.suspendedOrganizations} detail="Tenant access is currently blocked" tone="danger" index={2} />
        <StatCard label="Inactive" value={dashboard.inactiveOrganizations} detail="Organizations not yet operational" index={3} />
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Recent organizations</h2>
            <p className="mt-1 text-sm text-zinc-500">Latest cinema tenants added to CineBite.</p>
          </div>
          <Link href="/super-admin/organizations" className="text-sm font-medium text-amber-300 hover:text-amber-200">View all</Link>
        </div>
        {dashboard.recentOrganizations.length === 0 ? (
          <EmptyState
            title="No organizations yet"
            description="Onboard the first cinema organization, location, and administrator through the secure wizard."
            action={{ href: "/super-admin/organizations/new", label: "Add first organization" }}
          />
        ) : (
          <div className="cb-panel divide-y divide-[var(--cb-border)] overflow-hidden">
            {dashboard.recentOrganizations.map((organization) => (
              <Link key={organization.id} href={`/super-admin/organizations/${organization.id}`} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025] sm:px-6">
                <span>
                  <span className="block font-medium text-zinc-100">{organization.name}</span>
                  <span className="mt-1 block text-xs text-zinc-600">Added {formatDashboardDate(organization.createdAt.toDate())}</span>
                </span>
                <StatusBadge status={organization.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageTransition>
  );
}
