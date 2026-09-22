import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/server/auth/current-user";
import { mapLocationDocument, mapOrganizationDocument } from "@/server/firestore/mappers";
import {
  auditLogDocumentPath,
  locationDocumentPath,
  locationSlugDocumentPath,
  organizationDocumentPath,
} from "@/server/firestore/paths";
import {
  getOrganizationDetail,
  getSuperAdminDashboardData,
  listOrganizations,
} from "@/server/repositories/super-admin.repository";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";
import type { Location } from "@/types/location";
import type { Organization } from "@/types/organization";
import type {
  OrganizationDetail,
  SuperAdminDashboardData,
} from "@/types/super-admin";
import type { OrganizationStatus } from "@/types/status";
import {
  createLocationSchema,
} from "@/validation/location";
import { organizationDocumentSchema } from "@/validation/organization";
import { organizationStatusChangeSchema } from "@/validation/onboarding";
import { documentIdSchema } from "@/validation/shared";

export interface AddLocationCommitInput {
  actorUid: string;
  organizationId: string;
  locationId: string;
  auditLogId: string;
  auditAction: "LOCATION_CREATED";
  location: ReturnType<typeof createLocationSchema.parse>;
}

export interface StatusCommitInput {
  actorUid: string;
  organizationId: string;
  auditLogId: string;
  auditAction: "ORGANIZATION_SUSPENDED" | "ORGANIZATION_REACTIVATED";
  status: "ACTIVE" | "SUSPENDED";
}

export interface OrganizationManagementDependencies {
  allocateLocationIds(): { locationId: string; auditLogId: string };
  addLocation(input: AddLocationCommitInput): Promise<Location>;
  allocateStatusAuditId(): string;
  updateStatus(input: StatusCommitInput): Promise<Organization>;
}

function assertSuperAdmin(actor: AuthenticatedUser | null): AuthenticatedUser {
  if (!actor) {
    throw new ServiceError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Authentication is required.",
    );
  }

  if (!actor.active || actor.role !== "SUPER_ADMIN") {
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Super Admin access is required.",
    );
  }

  return actor;
}

export function createOrganizationManagementService(
  dependencies: OrganizationManagementDependencies,
) {
  return {
    async addLocation(
      organizationIdInput: string,
      input: unknown,
      actorInput: AuthenticatedUser | null,
    ): Promise<Location> {
      const actor = assertSuperAdmin(actorInput);
      const organizationId = documentIdSchema.parse(organizationIdInput);
      const location = createLocationSchema.parse(input);
      const ids = dependencies.allocateLocationIds();

      return dependencies.addLocation({
        actorUid: actor.uid,
        organizationId,
        location,
        auditAction: "LOCATION_CREATED",
        ...ids,
      });
    },

    async updateStatus(
      organizationIdInput: string,
      input: unknown,
      actorInput: AuthenticatedUser | null,
    ): Promise<Organization> {
      const actor = assertSuperAdmin(actorInput);
      const organizationId = documentIdSchema.parse(organizationIdInput);
      const { status } = organizationStatusChangeSchema.parse(input);

      return dependencies.updateStatus({
        actorUid: actor.uid,
        organizationId,
        auditLogId: dependencies.allocateStatusAuditId(),
        status,
        auditAction:
          status === "ACTIVE"
            ? "ORGANIZATION_REACTIVATED"
            : "ORGANIZATION_SUSPENDED",
      });
    },
  };
}

function productionDependencies(): OrganizationManagementDependencies {
  const firestore = getAdminFirestore();

  return {
    allocateLocationIds() {
      return {
        locationId: firestore.collection("_ids").doc().id,
        auditLogId: firestore.collection("auditLogs").doc().id,
      };
    },
    async addLocation(input) {
      const organizationReference = firestore.doc(
        organizationDocumentPath(input.organizationId),
      );
      const locationReference = firestore.doc(
        locationDocumentPath(input.organizationId, input.locationId),
      );
      const slugReference = firestore.doc(
        locationSlugDocumentPath(
          input.organizationId,
          input.location.slug,
        ),
      );
      const auditReference = firestore.doc(
        auditLogDocumentPath(input.auditLogId),
      );

      await firestore.runTransaction(async (transaction) => {
        const [organizationSnapshot, slugSnapshot] = await Promise.all([
          transaction.get(organizationReference),
          transaction.get(slugReference),
        ]);

        if (!organizationSnapshot.exists) {
          throw new ServiceError(
            "ORGANIZATION_NOT_FOUND",
            404,
            "Organization not found.",
          );
        }

        const organization = organizationDocumentSchema.parse(
          organizationSnapshot.data(),
        );

        if (organization.status !== "ACTIVE") {
          throw new ServiceError(
            "ORGANIZATION_NOT_ACTIVE",
            409,
            "Locations can only be added to an active organization.",
          );
        }

        if (slugSnapshot.exists) {
          throw new ServiceError(
            "DUPLICATE_LOCATION_SLUG",
            409,
            "This location slug is already in use for the organization.",
          );
        }

        const timestamp = FieldValue.serverTimestamp();
        transaction.create(locationReference, {
          ...input.location,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.create(slugReference, {
          locationId: input.locationId,
          createdAt: timestamp,
        });
        transaction.create(auditReference, {
          actorUid: input.actorUid,
          action: input.auditAction,
          entityType: "LOCATION",
          entityId: input.locationId,
          organizationId: input.organizationId,
          metadata: { slug: input.location.slug },
          createdAt: timestamp,
        });
      });

      const location = mapLocationDocument(
        input.organizationId,
        await locationReference.get(),
      );

      if (!location) {
        throw new Error("Location was created but could not be read back.");
      }

      return location;
    },
    allocateStatusAuditId() {
      return firestore.collection("auditLogs").doc().id;
    },
    async updateStatus(input) {
      const organizationReference = firestore.doc(
        organizationDocumentPath(input.organizationId),
      );
      const auditReference = firestore.doc(
        auditLogDocumentPath(input.auditLogId),
      );

      await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(organizationReference);

        if (!snapshot.exists) {
          throw new ServiceError(
            "ORGANIZATION_NOT_FOUND",
            404,
            "Organization not found.",
          );
        }

        const organization = organizationDocumentSchema.parse(snapshot.data());

        if (organization.status === input.status) {
          throw new ServiceError(
            "NO_STATUS_CHANGE",
            409,
            `Organization is already ${input.status.toLowerCase()}.`,
          );
        }

        const timestamp = FieldValue.serverTimestamp();
        transaction.update(organizationReference, {
          status: input.status,
          updatedAt: timestamp,
        });
        transaction.create(auditReference, {
          actorUid: input.actorUid,
          action: input.auditAction,
          entityType: "ORGANIZATION",
          entityId: input.organizationId,
          organizationId: input.organizationId,
          metadata: {
            previousStatus: organization.status,
            status: input.status,
          },
          createdAt: timestamp,
        });
      });

      const organization = mapOrganizationDocument(
        await organizationReference.get(),
      );

      if (!organization) {
        throw new Error("Organization was updated but could not be read back.");
      }

      return organization;
    },
  };
}

export async function addOrganizationLocation(
  organizationId: string,
  input: unknown,
): Promise<Location> {
  const actor = await getCurrentUser();
  return createOrganizationManagementService(
    productionDependencies(),
  ).addLocation(organizationId, input, actor);
}

export async function changeOrganizationStatus(
  organizationId: string,
  input: unknown,
): Promise<Organization> {
  const actor = await getCurrentUser();
  return createOrganizationManagementService(
    productionDependencies(),
  ).updateStatus(organizationId, input, actor);
}

export async function listOrganizationsForSuperAdmin(): Promise<Organization[]> {
  assertSuperAdmin(await getCurrentUser());
  return listOrganizations();
}

export async function getDashboardForSuperAdmin(): Promise<SuperAdminDashboardData> {
  assertSuperAdmin(await getCurrentUser());
  return getSuperAdminDashboardData();
}

export async function getOrganizationForSuperAdmin(
  organizationIdInput: string,
): Promise<OrganizationDetail | null> {
  assertSuperAdmin(await getCurrentUser());
  const organizationId = documentIdSchema.parse(organizationIdInput);
  return getOrganizationDetail(organizationId);
}

export function organizationAllowsTenantAccess(
  status: OrganizationStatus,
): boolean {
  return status === "ACTIVE";
}
