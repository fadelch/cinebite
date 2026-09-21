import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SuperAdminShell } from "@/components/super-admin/super-admin-shell";
import { requirePageRole } from "@/server/auth/page-guards";

export const metadata: Metadata = {
  title: { default: "Super Admin | CineBite", template: "%s | CineBite" },
};

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageRole(["SUPER_ADMIN"]);
  return <SuperAdminShell user={{ displayName: user.displayName, email: user.email }}>{children}</SuperAdminShell>;
}
