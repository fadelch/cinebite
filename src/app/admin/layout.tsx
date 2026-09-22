import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { requirePageRole } from "@/server/auth/page-guards";
import { getTenantShellContext } from "@/server/services/tenant-structure.service";

export const metadata: Metadata = {
  title: { default: "Cinema Admin | CineBite", template: "%s | CineBite" },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageRole(["CINEMA_ADMIN", "LOCATION_MANAGER"]);
  const context = await getTenantShellContext();
  return <AdminShell context={context}>{children}</AdminShell>;
}
