import Link from "next/link";

import { OrganizationWizard } from "@/components/super-admin/organization-wizard";
import { PageTransition } from "@/components/super-admin/page-transition";
import { requirePageRole } from "@/server/auth/page-guards";

export const metadata = { title: "Add organization" };

export default async function NewOrganizationPage() {
  await requirePageRole(["SUPER_ADMIN"]);

  return (
    <PageTransition>
      <header>
        <Link href="/super-admin/organizations" className="text-sm text-zinc-500 hover:text-zinc-200">← Organizations</Link>
        <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Secure onboarding</p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-50">Add cinema organization</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Collect all required information first. CineBite creates the tenant, first venue, and administrator in one authoritative workflow.</p>
      </header>
      <div className="mt-8"><OrganizationWizard /></div>
    </PageTransition>
  );
}
