import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getCurrentUser } from "@/server/auth/current-user";
import {
  auditLogDocumentPath,
  locationDocumentPath,
  locationSlugDocumentPath,
  organizationDocumentPath,
  organizationSlugDocumentPath,
  userDocumentPath,
} from "@/server/firestore/paths";
import { ServiceError } from "@/server/services/service-error";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import type { AuthenticatedUser } from "@/types/auth";
import type { AuditAction, AuditEntityType } from "@/types/audit";
import type { OrganizationOnboardingResult } from "@/types/super-admin";
import type { UserProfileDocument } from "@/types/user";
import {
  organizationOnboardingSchema,
  type ValidatedOrganizationOnboardingInput,
} from "@/validation/onboarding";

interface CreatedAuthenticationUser {
  uid: string;
}

interface AuditEventInput {
  id: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  organizationId: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface OnboardingCommitInput {
  actorUid: string;
  administratorUid: string;
  organizationId: string;
  locationId: string;
  data: ValidatedOrganizationOnboardingInput;
  administratorProfile: Omit<
    UserProfileDocument,
    "createdAt" | "updatedAt"
  >;
  auditEvents: AuditEventInput[];
}

export interface OrganizationOnboardingDependencies {
  administratorEmailExists(email: string): Promise<boolean>;
  createAdministrator(input: {
    displayName: string;
    email: string;
  }): Promise<CreatedAuthenticationUser>;
  setAdministratorClaims(uid: string, organizationId: string): Promise<void>;
  generateSetupLink(email: string): Promise<string>;
  deleteAdministrator(uid: string): Promise<void>;
  allocateIds(): {
    organizationId: string;
    locationId: string;
    organizationAuditId: string;
    locationAuditId: string;
    administratorAuditId: string;
  };
  commitOnboarding(input: OnboardingCommitInput): Promise<void>;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
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

export function createOrganizationOnboardingService(
  dependencies: OrganizationOnboardingDependencies,
) {
  return async function onboardOrganizationWithDependencies(
    input: unknown,
    actorInput: AuthenticatedUser | null,
  ): Promise<OrganizationOnboardingResult> {
    const actor = assertSuperAdmin(actorInput);
    const data = organizationOnboardingSchema.parse(input);

    if (await dependencies.administratorEmailExists(data.administrator.email)) {
      throw new ServiceError(
        "DUPLICATE_ADMIN_EMAIL",
        409,
        "A Firebase Authentication account already uses this email.",
      );
    }

    const ids = dependencies.allocateIds();
    let createdAdministrator: CreatedAuthenticationUser | null = null;

    try {
      createdAdministrator = await dependencies.createAdministrator(
        data.administrator,
      );
      await dependencies.setAdministratorClaims(
        createdAdministrator.uid,
        ids.organizationId,
      );
      const setupLink = await dependencies.generateSetupLink(
        data.administrator.email,
      );

      await dependencies.commitOnboarding({
        actorUid: actor.uid,
        administratorUid: createdAdministrator.uid,
        organizationId: ids.organizationId,
        locationId: ids.locationId,
        data,
        administratorProfile: {
          displayName: data.administrator.displayName,
          email: data.administrator.email,
          role: "CINEMA_ADMIN",
          organizationId: ids.organizationId,
          locationIds: [],
          allLocations: true,
          active: true,
        },
        auditEvents: [
          {
            id: ids.organizationAuditId,
            action: "ORGANIZATION_CREATED",
            entityType: "ORGANIZATION",
            entityId: ids.organizationId,
            organizationId: ids.organizationId,
            metadata: {
              slug: data.organization.slug,
              initialLocationId: ids.locationId,
            },
          },
          {
            id: ids.locationAuditId,
            action: "LOCATION_CREATED",
            entityType: "LOCATION",
            entityId: ids.locationId,
            organizationId: ids.organizationId,
            metadata: { slug: data.firstLocation.slug, initial: true },
          },
          {
            id: ids.administratorAuditId,
            action: "CINEMA_ADMIN_CREATED",
            entityType: "USER",
            entityId: createdAdministrator.uid,
            organizationId: ids.organizationId,
            metadata: { role: "CINEMA_ADMIN" },
          },
        ],
      });

      return {
        organizationId: ids.organizationId,
        locationId: ids.locationId,
        administratorUid: createdAdministrator.uid,
        setupLink,
      };
    } catch (error) {
      if (createdAdministrator) {
        try {
          await dependencies.deleteAdministrator(createdAdministrator.uid);
        } catch (cleanupError) {
          console.error("[onboarding] Firebase Auth cleanup failed.", {
            code: errorCode(cleanupError),
          });
        }
      }

      if (error instanceof ServiceError) {
        throw error;
      }

      if (errorCode(error) === "auth/email-already-exists") {
        throw new ServiceError(
          "DUPLICATE_ADMIN_EMAIL",
          409,
          "A Firebase Authentication account already uses this email.",
        );
      }

      throw new ServiceError(
        "ONBOARDING_FAILED",
        500,
        "The organization could not be onboarded. No administrator account was retained.",
      );
    }
  };
}

function auditRecord(input: {
  actorUid: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  organizationId: string;
  metadata: Record<string, string | number | boolean | null>;
}) {
  return {
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  };
}

function productionDependencies(): OrganizationOnboardingDependencies {
  const auth = getAdminAuth();
  const firestore = getAdminFirestore();

  return {
    async administratorEmailExists(email) {
      try {
        await auth.getUserByEmail(email);
        return true;
      } catch (error) {
        if (errorCode(error) === "auth/user-not-found") {
          return false;
        }

        throw error;
      }
    },
    async createAdministrator(input) {
      return auth.createUser({
        displayName: input.displayName,
        email: input.email,
        disabled: false,
      });
    },
    async setAdministratorClaims(uid, organizationId) {
      await auth.setCustomUserClaims(uid, {
        role: "CINEMA_ADMIN",
        organizationId,
      });
    },
    async generateSetupLink(email) {
      return auth.generatePasswordResetLink(email);
    },
    async deleteAdministrator(uid) {
      await auth.deleteUser(uid);
    },
    allocateIds() {
      return {
        organizationId: firestore.collection("organizations").doc().id,
        locationId: firestore.collection("_ids").doc().id,
        organizationAuditId: firestore.collection("auditLogs").doc().id,
        locationAuditId: firestore.collection("auditLogs").doc().id,
        administratorAuditId: firestore.collection("auditLogs").doc().id,
      };
    },
    async commitOnboarding(input) {
      const organizationReference = firestore.doc(
        organizationDocumentPath(input.organizationId),
      );
      const organizationSlugReference = firestore.doc(
        organizationSlugDocumentPath(input.data.organization.slug),
      );
      const locationReference = firestore.doc(
        locationDocumentPath(input.organizationId, input.locationId),
      );
      const locationSlugReference = firestore.doc(
        locationSlugDocumentPath(
          input.organizationId,
          input.data.firstLocation.slug,
        ),
      );
      const profileReference = firestore.doc(
        userDocumentPath(input.administratorUid),
      );

      await firestore.runTransaction(async (transaction) => {
        const slugOwnership = await transaction.get(
          organizationSlugReference,
        );

        if (slugOwnership.exists) {
          throw new ServiceError(
            "DUPLICATE_ORGANIZATION_SLUG",
            409,
            "This organization slug is already in use.",
          );
        }

        const timestamp = FieldValue.serverTimestamp();

        transaction.create(organizationReference, {
          ...input.data.organization,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.create(organizationSlugReference, {
          organizationId: input.organizationId,
          createdAt: timestamp,
        });
        transaction.create(locationReference, {
          ...input.data.firstLocation,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.create(locationSlugReference, {
          locationId: input.locationId,
          createdAt: timestamp,
        });
        transaction.create(profileReference, {
          ...input.administratorProfile,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        for (const event of input.auditEvents) {
          transaction.create(
            firestore.doc(auditLogDocumentPath(event.id)),
            auditRecord({
              ...event,
              actorUid: input.actorUid,
            }),
          );
        }
      });
    },
  };
}

export async function onboardOrganization(
  input: unknown,
): Promise<OrganizationOnboardingResult> {
  const actor = await getCurrentUser();
  return createOrganizationOnboardingService(productionDependencies())(
    input,
    actor,
  );
}
