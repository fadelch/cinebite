import Link from "next/link";

import { EmptyState } from "@/components/super-admin/empty-state";
import { OrganizationList } from "@/components/super-admin/organization-list";
import { PageTransition } from "@/components/super-admin/page-transition";
import { toOrganizationDto } from "@/lib/super-admin/dto";
import { listOrganizationsForSuperAdmin } from "@/server/services/organization-management.service";
import { ORGANIZATION_STATUSES } from "@/types/status";

export const metadata = { title: "Organizations" };

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [{ q = "", status = "" }, organizations] = await Promise.all([searchParams, listOrganizationsForSuperAdmin()]);
  const query = q.trim().toLowerCase();
  const validStatus =
    ORGANIZATION_STATUSES.find((option) => option === status) ?? "";
  const filtered = organizations.filter(
    (organization) =>
      (!query || organization.name.toLowerCase().includes(query)) &&
      (!validStatus || organization.status === validStatus),
  );

  return (
    <PageTransition>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Tenant directory</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-50">Organizations</h1>
          <p className="mt-2 text-sm text-zinc-400">View and manage every cinema tenant without crossing data boundaries.</p>
        </div>
        <Link href="/super-admin/organizations/new" className="cb-button-primary">Add organization</Link>
      </header>

      <form className="cb-panel mt-7 grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label>
          <span className="sr-only">Search organizations</span>
          <input name="q" defaultValue={q} className="cb-field" placeholder="Search by organization name" />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select name="status" defaultValue={validStatus} className="cb-field">
            <option value="">All statuses</option>
            {ORGANIZATION_STATUSES.map((option) => <option key={option} value={option}>{option[0] + option.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
        <button type="submit" className="cb-button-secondary">Apply filters</button>
      </form>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState
            title={organizations.length ? "No matching organizations" : "No organizations yet"}
            description={organizations.length ? "Adjust the search or status filter to see more results." : "Onboard the first cinema tenant through the guided workflow."}
            action={organizations.length ? undefined : { href: "/super-admin/organizations/new", label: "Add first organization" }}
          />
        ) : (
          <OrganizationList organizations={filtered.map(toOrganizationDto)} />
        )}
      </div>
    </PageTransition>
  );
}
