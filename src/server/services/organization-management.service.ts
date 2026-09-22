import "server-only";

import { randomUUID } from "node:crypto";

import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/server/auth/current-user";
import { toLocationDomain, toOrganizationDomain } from "@/server/database/mappers";
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
  return {
    allocateLocationIds() {
      return {
        locationId: randomUUID(),
        auditLogId: randomUUID(),
      };
    },
    async addLocation(input) {
      try {
        const location = await prisma.$transaction(async (transaction) => {
          const [organization, actor] = await Promise.all([
            transaction.organization.findUnique({
              where: { id: input.organizationId },
            }),
            transaction.user.findUnique({
              where: { firebaseUid: input.actorUid },
              select: { id: true },
            }),
          ]);
          if (!organization) {
            throw new ServiceError(
              "ORGANIZATION_NOT_FOUND",
              404,
              "Organization not found.",
            );
          }
          if (!actor) {
            throw new ServiceError(
              "AUTHENTICATION_REQUIRED",
              401,
              "Authentication is required.",
            );
          }
          if (organization.status !== "ACTIVE") {
            throw new ServiceError(
              "ORGANIZATION_NOT_ACTIVE",
              409,
              "Locations can only be added to an active organization.",
            );
          }

          const created = await transaction.location.create({
            data: {
              id: input.locationId,
              organizationId: input.organizationId,
              name: input.location.name,
              slug: input.location.slug,
              status: input.location.status,
              addressLine1: input.location.address.line1,
              addressLine2: input.location.address.line2,
              postalCode: input.location.address.postalCode,
              city: input.location.city,
              country: input.location.country,
              timezone: input.location.timezone,
            },
          });
          await transaction.auditLog.create({
            data: {
              id: input.auditLogId,
              actorUserId: actor.id,
              action: input.auditAction,
              entityType: "LOCATION",
              entityId: input.locationId,
              organizationId: input.organizationId,
              locationId: input.locationId,
              metadata: { slug: input.location.slug },
            },
          });
          return created;
        });
        return toLocationDomain(location);
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          throw new ServiceError(
            "DUPLICATE_LOCATION_SLUG",
            409,
            "This location slug is already in use for the organization.",
          );
        }
        throw error;
      }
    },
    allocateStatusAuditId() {
      return randomUUID();
    },
    async updateStatus(input) {
      const organization = await prisma.$transaction(async (transaction) => {
        const [existing, actor] = await Promise.all([
          transaction.organization.findUnique({
            where: { id: input.organizationId },
          }),
          transaction.user.findUnique({
            where: { firebaseUid: input.actorUid },
            select: { id: true },
          }),
        ]);
        if (!existing) {
          throw new ServiceError(
            "ORGANIZATION_NOT_FOUND",
            404,
            "Organization not found.",
          );
        }
        if (!actor) {
          throw new ServiceError(
            "AUTHENTICATION_REQUIRED",
            401,
            "Authentication is required.",
          );
        }
        if (existing.status === input.status) {
          throw new ServiceError(
            "NO_STATUS_CHANGE",
            409,
            `Organization is already ${input.status.toLowerCase()}.`,
          );
        }

        const updated = await transaction.organization.update({
          where: { id: input.organizationId },
          data: { status: input.status },
        });
        await transaction.auditLog.create({
          data: {
            id: input.auditLogId,
            actorUserId: actor.id,
            action: input.auditAction,
            entityType: "ORGANIZATION",
            entityId: input.organizationId,
            organizationId: input.organizationId,
            metadata: {
              previousStatus: existing.status,
              status: input.status,
            },
          },
        });
        return updated;
      });
      return toOrganizationDomain(organization);
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
