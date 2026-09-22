import Link from "next/link";

import { LocationCards } from "@/components/admin/location-cards";
import { EmptyState } from "@/components/super-admin/empty-state";
import { PageTransition } from "@/components/super-admin/page-transition";
import { toTenantLocationDto } from "@/lib/tenant-admin/dto";
import { getTenantShellContext, listLocationsForTenantUser } from "@/server/services/tenant-structure.service";

export const metadata = { title: "Locations" };

export default async function AdminLocationsPage() {
  const [locations, context] = await Promise.all([listLocationsForTenantUser(), getTenantShellContext()]);
  const canCreate = context.user.role === "CINEMA_ADMIN";
  return (
    <PageTransition>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Cinema structure</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Locations</h1><p className="mt-2 text-sm text-zinc-400">Physical venues available to your account.</p></div>
        {canCreate ? <Link href="/admin/locations/new" className="cb-button-primary">Add location</Link> : null}
      </header>
      <div className="mt-7">
        {locations.length === 0 ? (
          <EmptyState
            title={canCreate ? "Your organization does not have any cinema locations yet" : "No locations are assigned"}
            description={canCreate ? "Create the first venue, then add halls and generate seats." : "Ask a Cinema Administrator to assign a location to your account."}
            action={canCreate ? { href: "/admin/locations/new", label: "Add location" } : undefined}
          />
        ) : <LocationCards locations={locations.map(toTenantLocationDto)} />}
      </div>
    </PageTransition>
  );
}
