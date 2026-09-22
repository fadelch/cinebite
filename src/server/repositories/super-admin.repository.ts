import "server-only";

import { getAdminFirestore } from "@/lib/firebase/admin";
import { mapOrganizationDocument } from "@/server/firestore/mappers";
import { listLocationsForOrganization } from "@/server/repositories/locations.repository";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import type {
  CinemaAdministratorSummary,
  OrganizationDetail,
  SuperAdminDashboardData,
} from "@/types/super-admin";
import { userProfileDocumentSchema } from "@/validation/user";

export async function listOrganizations() {
  const snapshot = await getAdminFirestore()
    .collection("organizations")
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((document) => {
    const organization = mapOrganizationDocument(document);

    if (!organization) {
      throw new Error(`Organization "${document.id}" could not be mapped.`);
    }

    return organization;
  });
}

export async function getSuperAdminDashboardData(): Promise<SuperAdminDashboardData> {
  const organizations = await listOrganizations();

  return {
    totalOrganizations: organizations.length,
    activeOrganizations: organizations.filter(
      (organization) => organization.status === "ACTIVE",
    ).length,
    suspendedOrganizations: organizations.filter(
      (organization) => organization.status === "SUSPENDED",
    ).length,
    inactiveOrganizations: organizations.filter(
      (organization) => organization.status === "INACTIVE",
    ).length,
    recentOrganizations: organizations.slice(0, 5),
  };
}

export async function getOrganizationDetail(
  organizationId: string,
): Promise<OrganizationDetail | null> {
  const organization = await getOrganizationById(organizationId);

  if (!organization) {
    return null;
  }

  const [locations, userSnapshot] = await Promise.all([
    listLocationsForOrganization(organizationId),
    getAdminFirestore()
      .collection("users")
      .where("organizationId", "==", organizationId)
      .get(),
  ]);

  const administrators = userSnapshot.docs.flatMap(
    (document): CinemaAdministratorSummary[] => {
      const profile = userProfileDocumentSchema.parse(document.data());

      return profile.role === "CINEMA_ADMIN"
        ? [
            {
              uid: document.id,
              displayName: profile.displayName,
              email: profile.email,
              active: profile.active,
            },
          ]
        : [];
    },
  );

  return { organization, locations, administrators };
}
