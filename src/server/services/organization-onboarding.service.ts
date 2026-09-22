import "server-only";

import { randomUUID } from "node:crypto";

import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/server/auth/current-user";
import { ServiceError } from "@/server/services/service-error";
import { getAdminAuth } from "@/lib/firebase/admin";
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

function productionDependencies(): OrganizationOnboardingDependencies {
  const auth = getAdminAuth();

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
        organizationId: randomUUID(),
        locationId: randomUUID(),
        organizationAuditId: randomUUID(),
        locationAuditId: randomUUID(),
        administratorAuditId: randomUUID(),
      };
    },
    async commitOnboarding(input) {
      try {
        await prisma.$transaction(async (transaction) => {
          const actor = await transaction.user.findUnique({
            where: { firebaseUid: input.actorUid },
            select: { id: true },
          });
          if (!actor) {
            throw new ServiceError(
              "AUTHENTICATION_REQUIRED",
              401,
              "Authentication is required.",
            );
          }

          await transaction.organization.create({
            data: {
              id: input.organizationId,
              ...input.data.organization,
            },
          });
          await transaction.location.create({
            data: {
              id: input.locationId,
              organizationId: input.organizationId,
              name: input.data.firstLocation.name,
              slug: input.data.firstLocation.slug,
              status: input.data.firstLocation.status,
              addressLine1: input.data.firstLocation.address.line1,
              addressLine2: input.data.firstLocation.address.line2,
              postalCode: input.data.firstLocation.address.postalCode,
              city: input.data.firstLocation.city,
              country: input.data.firstLocation.country,
              timezone: input.data.firstLocation.timezone,
            },
          });
          const administrator = await transaction.user.create({
            data: {
              firebaseUid: input.administratorUid,
              email: input.administratorProfile.email.toLowerCase(),
              displayName: input.administratorProfile.displayName,
              active: input.administratorProfile.active,
              platformRole: "USER",
            },
          });
          await transaction.organizationMembership.create({
            data: {
              userId: administrator.id,
              organizationId: input.organizationId,
              role: "CINEMA_ADMIN",
              allLocations: true,
            },
          });
          await transaction.auditLog.createMany({
            data: input.auditEvents.map((event) => ({
              id: event.id,
              actorUserId: actor.id,
              action: event.action,
              entityType: event.entityType,
              entityId: event.entityId,
              organizationId: event.organizationId,
              locationId:
                event.entityType === "LOCATION" ? event.entityId : null,
              metadata: event.metadata,
            })),
          });
        });
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          throw new ServiceError(
            "DUPLICATE_ORGANIZATION_SLUG",
            409,
            "The organization slug or administrator identity already exists.",
          );
        }
        throw error;
      }
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
