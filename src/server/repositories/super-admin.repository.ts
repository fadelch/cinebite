import "server-only";

import { prisma } from "@/lib/db/prisma";
import { toLocationDomain, toOrganizationDomain } from "@/server/database/mappers";
import type {
  CinemaAdministratorSummary,
  OrganizationDetail,
  SuperAdminDashboardData,
} from "@/types/super-admin";
import { documentIdSchema } from "@/validation/shared";

export async function listOrganizations() {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
  });
  return organizations.map(toOrganizationDomain);
}

export async function getSuperAdminDashboardData(): Promise<SuperAdminDashboardData> {
  const [totalOrganizations, activeOrganizations, suspendedOrganizations, inactiveOrganizations, recent] =
    await prisma.$transaction([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: "ACTIVE" } }),
      prisma.organization.count({ where: { status: "SUSPENDED" } }),
      prisma.organization.count({ where: { status: "INACTIVE" } }),
      prisma.organization.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

  return {
    totalOrganizations,
    activeOrganizations,
    suspendedOrganizations,
    inactiveOrganizations,
    recentOrganizations: recent.map(toOrganizationDomain),
  };
}

export async function getOrganizationDetail(
  organizationIdInput: string,
): Promise<OrganizationDetail | null> {
  const organizationId = documentIdSchema.parse(organizationIdInput);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      locations: { orderBy: { name: "asc" } },
      memberships: {
        where: { role: "CINEMA_ADMIN" },
        include: { user: true },
      },
    },
  });
  if (!organization) return null;

  const administrators: CinemaAdministratorSummary[] = organization.memberships.map(
    ({ user }) => ({
      uid: user.firebaseUid,
      displayName: user.displayName,
      email: user.email,
      active: user.active,
    }),
  );

  return {
    organization: toOrganizationDomain(organization),
    locations: organization.locations.map(toLocationDomain),
    administrators,
  };
}
