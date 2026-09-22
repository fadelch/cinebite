import "server-only";

import { generateSeatLayout } from "@/lib/tenant-admin/seats";
import { getCurrentUser } from "@/server/auth/current-user";
import {
  createHallRecord,
  createTenantLocationRecord,
  generateSeatsRecord,
  getLocationHall,
  getTenantLocation,
  listHallSeats,
  listLocationHalls,
  listTenantLocations,
  setHallStatusRecord,
  setSeatStatusRecord,
  type CreateHallRecordInput,
  type CreateTenantLocationRecordInput,
  type GenerateSeatsRecordInput,
  type SetHallStatusRecordInput,
  type SetSeatStatusRecordInput,
} from "@/server/repositories/tenant-structure.repository";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import { ServiceError } from "@/server/services/service-error";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { AuthenticatedUser } from "@/types/auth";
import type { Hall } from "@/types/hall";
import type { Location } from "@/types/location";
import type { Organization } from "@/types/organization";
import type { Seat } from "@/types/seat";
import type {
  TenantDashboardData,
  TenantHallDetail,
  TenantLocationDetail,
  TenantShellContext,
} from "@/types/tenant-admin";
import { createTenantHallSchema, hallStatusChangeSchema } from "@/validation/hall";
import { createLocationSchema } from "@/validation/location";
import { documentIdSchema } from "@/validation/shared";
import { generateSeatsSchema, seatStatusChangeSchema } from "@/validation/seat";

type TenantActor = AuthenticatedUser & {
  organizationId: string;
  role: "CINEMA_ADMIN" | "LOCATION_MANAGER";
};

export interface TenantStructureDependencies {
  getOrganization(organizationId: string): Promise<Organization | null>;
  listLocations(organizationId: string, permittedIds: readonly string[] | null): Promise<Location[]>;
  getLocation(organizationId: string, locationId: string): Promise<Location | null>;
  listHalls(organizationId: string, locationId: string): Promise<Hall[]>;
  getHall(organizationId: string, locationId: string, hallId: string): Promise<Hall | null>;
  listSeats(organizationId: string, locationId: string, hallId: string): Promise<Seat[]>;
  allocateIds(): { entityId: string; auditLogId: string };
  createLocation(input: CreateTenantLocationRecordInput): Promise<Location>;
  createHall(input: CreateHallRecordInput): Promise<Hall>;
  updateHallStatus(input: SetHallStatusRecordInput): Promise<Hall>;
  generateSeats(input: GenerateSeatsRecordInput): Promise<Seat[]>;
  updateSeatStatus(input: SetSeatStatusRecordInput): Promise<Seat>;
}

function requireTenantActor(actor: AuthenticatedUser | null): TenantActor {
  if (!actor) {
    throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  }
  if (!actor.active || (actor.role !== "CINEMA_ADMIN" && actor.role !== "LOCATION_MANAGER")) {
    throw new ServiceError("AUTHORIZATION_DENIED", 403, "Cinema structure access is not permitted.");
  }
  if (!actor.organizationId) {
    throw new ServiceError("TENANT_CONTEXT_MISSING", 403, "Your account is not assigned to an organization.");
  }
  return actor as TenantActor;
}

function permittedLocationIds(actor: TenantActor): readonly string[] | null {
  if (actor.role === "CINEMA_ADMIN" || actor.allLocations) return null;
  return actor.locationIds;
}

function assertLocationAccess(actor: TenantActor, locationId: string): void {
  if (
    actor.role === "LOCATION_MANAGER" &&
    !actor.allLocations &&
    !actor.locationIds.includes(locationId)
  ) {
    throw new ServiceError("LOCATION_ACCESS_DENIED", 403, "You do not have access to this location.");
  }
}

async function trustedTenant(
  dependencies: TenantStructureDependencies,
  actorInput: AuthenticatedUser | null,
): Promise<{ actor: TenantActor; organization: Organization }> {
  const actor = requireTenantActor(actorInput);
  const organization = await dependencies.getOrganization(actor.organizationId);

  if (!organization || organization.status !== "ACTIVE") {
    throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
  }
  return { actor, organization };
}

export function createTenantStructureService(dependencies: TenantStructureDependencies) {
  return {
    async getShellContext(actorInput: AuthenticatedUser | null): Promise<TenantShellContext> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      return {
        organizationName: organization.name,
        user: {
          displayName: actor.displayName,
          email: actor.email,
          role: actor.role,
        },
      };
    },

    async getDashboard(actorInput: AuthenticatedUser | null): Promise<TenantDashboardData> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      const locations = await dependencies.listLocations(
        organization.id,
        permittedLocationIds(actor),
      );
      const halls = (await Promise.all(
        locations.map((location) => dependencies.listHalls(organization.id, location.id)),
      )).flat();

      return {
        organization,
        locations,
        totalHalls: halls.length,
        totalSeats: halls.reduce((total, hall) => total + hall.seatCount, 0),
      };
    },

    async listLocations(actorInput: AuthenticatedUser | null): Promise<Location[]> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      return dependencies.listLocations(organization.id, permittedLocationIds(actor));
    },

    async getLocation(
      locationIdInput: string,
      actorInput: AuthenticatedUser | null,
    ): Promise<TenantLocationDetail | null> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      const locationId = documentIdSchema.parse(locationIdInput);
      assertLocationAccess(actor, locationId);
      const location = await dependencies.getLocation(organization.id, locationId);
      if (!location) return null;
      const halls = await dependencies.listHalls(organization.id, location.id);
      return { location, halls };
    },

    async createLocation(input: unknown, actorInput: AuthenticatedUser | null): Promise<Location> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      if (actor.role !== "CINEMA_ADMIN") {
        throw new ServiceError(
          "LOCATION_CREATION_DENIED",
          403,
          "Only Cinema Administrators can create organization locations.",
        );
      }
      const location = createLocationSchema.parse(input);
      const { entityId: locationId, auditLogId } = dependencies.allocateIds();
      return dependencies.createLocation({
        actorUid: actor.uid,
        organizationId: organization.id,
        locationId,
        auditLogId,
        location,
      });
    },

    async createHall(
      locationIdInput: string,
      input: unknown,
      actorInput: AuthenticatedUser | null,
    ): Promise<Hall> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      const locationId = documentIdSchema.parse(locationIdInput);
      assertLocationAccess(actor, locationId);
      const hall = createTenantHallSchema.parse(input);
      const { entityId: hallId, auditLogId } = dependencies.allocateIds();
      return dependencies.createHall({
        actorUid: actor.uid,
        organizationId: organization.id,
        locationId,
        hallId,
        auditLogId,
        hall,
      });
    },

    async getHall(
      locationIdInput: string,
      hallIdInput: string,
      actorInput: AuthenticatedUser | null,
    ): Promise<TenantHallDetail | null> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      const locationId = documentIdSchema.parse(locationIdInput);
      const hallId = documentIdSchema.parse(hallIdInput);
      assertLocationAccess(actor, locationId);
      const [location, hall] = await Promise.all([
        dependencies.getLocation(organization.id, locationId),
        dependencies.getHall(organization.id, locationId, hallId),
      ]);
      if (!location || !hall) return null;
      const seats = await dependencies.listSeats(organization.id, locationId, hallId);
      return { location, hall, seats };
    },

    async setHallStatus(
      locationIdInput: string,
      hallIdInput: string,
      input: unknown,
      actorInput: AuthenticatedUser | null,
    ): Promise<Hall> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      const locationId = documentIdSchema.parse(locationIdInput);
      const hallId = documentIdSchema.parse(hallIdInput);
      assertLocationAccess(actor, locationId);
      const { status } = hallStatusChangeSchema.parse(input);
      return dependencies.updateHallStatus({
        actorUid: actor.uid,
        organizationId: organization.id,
        locationId,
        hallId,
        auditLogId: dependencies.allocateIds().auditLogId,
        status,
      });
    },

    async generateSeats(
      locationIdInput: string,
      hallIdInput: string,
      input: unknown,
      actorInput: AuthenticatedUser | null,
    ): Promise<Seat[]> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      const locationId = documentIdSchema.parse(locationIdInput);
      const hallId = documentIdSchema.parse(hallIdInput);
      assertLocationAccess(actor, locationId);
      const validated = generateSeatsSchema.parse(input);
      const layout = generateSeatLayout(validated);
      return dependencies.generateSeats({
        actorUid: actor.uid,
        organizationId: organization.id,
        locationId,
        hallId,
        auditLogId: dependencies.allocateIds().auditLogId,
        seats: layout.seats,
      });
    },

    async setSeatStatus(
      locationIdInput: string,
      hallIdInput: string,
      seatIdInput: string,
      input: unknown,
      actorInput: AuthenticatedUser | null,
    ): Promise<Seat> {
      const { actor, organization } = await trustedTenant(dependencies, actorInput);
      const locationId = documentIdSchema.parse(locationIdInput);
      const hallId = documentIdSchema.parse(hallIdInput);
      const seatId = documentIdSchema.parse(seatIdInput);
      assertLocationAccess(actor, locationId);
      const { status } = seatStatusChangeSchema.parse(input);
      return dependencies.updateSeatStatus({
        actorUid: actor.uid,
        organizationId: organization.id,
        locationId,
        hallId,
        seatId,
        auditLogId: dependencies.allocateIds().auditLogId,
        status,
      });
    },
  };
}

function productionDependencies(): TenantStructureDependencies {
  return {
    getOrganization: getOrganizationById,
    listLocations: listTenantLocations,
    getLocation: getTenantLocation,
    listHalls: listLocationHalls,
    getHall: getLocationHall,
    listSeats: listHallSeats,
    allocateIds() {
      const database = getAdminFirestore();
      return {
        entityId: database.collection("_ids").doc().id,
        auditLogId: database.collection("auditLogs").doc().id,
      };
    },
    createLocation: createTenantLocationRecord,
    createHall: createHallRecord,
    updateHallStatus: setHallStatusRecord,
    generateSeats: generateSeatsRecord,
    updateSeatStatus: setSeatStatusRecord,
  };
}

async function serviceAndActor() {
  return {
    service: createTenantStructureService(productionDependencies()),
    actor: await getCurrentUser(),
  };
}

export async function getTenantShellContext() {
  const { service, actor } = await serviceAndActor();
  return service.getShellContext(actor);
}

export async function getTenantDashboard() {
  const { service, actor } = await serviceAndActor();
  return service.getDashboard(actor);
}

export async function listLocationsForTenantUser() {
  const { service, actor } = await serviceAndActor();
  return service.listLocations(actor);
}

export async function getTenantLocationDetail(locationId: string) {
  const { service, actor } = await serviceAndActor();
  return service.getLocation(locationId, actor);
}

export async function createLocationForTenant(input: unknown) {
  const { service, actor } = await serviceAndActor();
  return service.createLocation(input, actor);
}

export async function createHallForTenant(locationId: string, input: unknown) {
  const { service, actor } = await serviceAndActor();
  return service.createHall(locationId, input, actor);
}

export async function getTenantHallDetail(locationId: string, hallId: string) {
  const { service, actor } = await serviceAndActor();
  return service.getHall(locationId, hallId, actor);
}

export async function changeTenantHallStatus(locationId: string, hallId: string, input: unknown) {
  const { service, actor } = await serviceAndActor();
  return service.setHallStatus(locationId, hallId, input, actor);
}

export async function generateTenantSeats(locationId: string, hallId: string, input: unknown) {
  const { service, actor } = await serviceAndActor();
  return service.generateSeats(locationId, hallId, input, actor);
}

export async function changeTenantSeatStatus(
  locationId: string,
  hallId: string,
  seatId: string,
  input: unknown,
) {
  const { service, actor } = await serviceAndActor();
  return service.setSeatStatus(locationId, hallId, seatId, input, actor);
}
