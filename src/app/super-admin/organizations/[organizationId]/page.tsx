import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/super-admin/empty-state";
import { OrganizationActions } from "@/components/super-admin/organization-actions";
import { PageTransition } from "@/components/super-admin/page-transition";
import { StatusBadge } from "@/components/super-admin/status-badge";
import { formatDashboardDate } from "@/lib/super-admin/format";
import { getOrganizationForSuperAdmin } from "@/server/services/organization-management.service";

export const metadata = { title: "Organization details" };

export default async function OrganizationDetailPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const detail = await getOrganizationForSuperAdmin(organizationId);

  if (!detail) notFound();

  const { organization, locations, administrators } = detail;

  return (
    <PageTransition>
      <Link href="/super-admin/organizations" className="text-sm text-zinc-500 hover:text-zinc-200">← Organizations</Link>
      <header className="mt-6 flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold text-zinc-50">{organization.name}</h1>
            <StatusBadge status={organization.status} />
          </div>
          <p className="mt-2 font-mono text-sm text-zinc-600">{organization.slug}</p>
          <p className="mt-3 text-sm text-zinc-500">Created {formatDashboardDate(organization.createdAt.toDate())}</p>
        </div>
        <OrganizationActions organizationId={organization.id} organizationName={organization.name} status={organization.status} />
      </header>

      {organization.status !== "ACTIVE" ? (
        <div className="mt-7 rounded-2xl border border-red-400/15 bg-red-400/[0.06] px-5 py-4 text-sm leading-6 text-red-100/80">
          Tenant staff access is blocked while this organization is {organization.status.toLowerCase()}. Super Admin management remains available.
        </div>
      ) : null}

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-zinc-100">Locations</h2>
            <p className="mt-1 text-sm text-zinc-500">{locations.length} physical {locations.length === 1 ? "venue" : "venues"}</p>
          </div>
          {locations.length === 0 ? (
            <EmptyState title="No locations" description="This organization has no physical venues yet." />
          ) : (
            <div className="space-y-3">
              {locations.map((location) => (
                <article key={location.id} className="cb-panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-zinc-100">{location.name}</h3>
                      <p className="mt-1 text-sm text-zinc-500">{location.address.line1}, {location.city}, {location.country}</p>
                      <p className="mt-2 font-mono text-xs text-zinc-600">{location.slug} · {location.timezone}</p>
                    </div>
                    <StatusBadge status={location.status} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-zinc-100">Cinema administrators</h2>
            <p className="mt-1 text-sm text-zinc-500">Safe account profile information only.</p>
          </div>
          <div className="cb-panel divide-y divide-[var(--cb-border)] overflow-hidden">
            {administrators.length ? administrators.map((administrator) => (
              <article key={administrator.uid} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-zinc-100">{administrator.displayName}</h3>
                    <p className="mt-1 truncate text-sm text-zinc-500">{administrator.email}</p>
                  </div>
                  <span className={`size-2.5 shrink-0 rounded-full ${administrator.active ? "bg-emerald-400" : "bg-zinc-600"}`} title={administrator.active ? "Active" : "Inactive"} />
                </div>
              </article>
            )) : (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">No cinema administrator profile found.</p>
            )}
          </div>
        </div>
      </section>
    </PageTransition>
  );
}
