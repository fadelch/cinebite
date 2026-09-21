import Link from "next/link";

export default function OrganizationNotFound() {
  return (
    <section className="cb-panel px-6 py-12 text-center">
      <p className="text-xs font-semibold tracking-[0.16em] text-amber-300 uppercase">Not found</p>
      <h1 className="mt-3 text-2xl font-semibold text-zinc-50">Organization unavailable</h1>
      <p className="mt-3 text-sm text-zinc-400">The organization ID is invalid or the record no longer exists.</p>
      <Link href="/super-admin/organizations" className="cb-button-primary mt-6">Return to organizations</Link>
    </section>
  );
}
