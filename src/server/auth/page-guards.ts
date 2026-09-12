import "server-only";

import { redirect } from "next/navigation";

import { hasRole } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/server/auth/current-user";
import type { AuthenticatedUser } from "@/types/auth";
import type { UserRole } from "@/types/status";

export async function requirePageRole(
  allowedRoles: readonly UserRole[],
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasRole(user, allowedRoles)) {
    redirect("/unauthorized");
  }

  return user;
}
