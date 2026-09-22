import Link from "next/link";

import { StatusBadge } from "@/components/super-admin/status-badge";
import { formatDashboardDate } from "@/lib/super-admin/format";
import type { OrganizationDto } from "@/lib/super-admin/dto";

export function OrganizationList({
  organizations,
}: {
  organizations: OrganizationDto[];
}) {
  return (
    <div className="cb-panel overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto] gap-4 border-b border-[var(--cb-border)] px-6 py-3 text-xs font-semibold tracking-[0.12em] text-zinc-600 uppercase md:grid">
        <span>Organization</span>
        <span>Slug</span>
        <span>Status</span>
        <span>Created</span>
      </div>
      <ul className="divide-y divide-[var(--cb-border)]">
        {organizations.map((organization) => (
          <li key={organization.id}>
            <Link
              href={`/super-admin/organizations/${organization.id}`}
              className="grid gap-3 px-5 py-5 transition-colors hover:bg-white/[0.025] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto] md:items-center md:gap-4 md:px-6"
            >
              <span>
                <span className="block font-medium text-zinc-100">
                  {organization.name}
                </span>
                <span className="mt-1 block text-xs text-zinc-600 md:hidden">
                  Created {formatDashboardDate(organization.createdAt)}
                </span>
              </span>
              <code className="w-fit rounded-md bg-zinc-950 px-2 py-1 text-xs text-zinc-500">
                {organization.slug}
              </code>
              <StatusBadge status={organization.status} />
              <span className="hidden text-sm text-zinc-500 md:block">
                {formatDashboardDate(organization.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
