import "server-only";

import { getCurrentUser } from "@/server/auth/current-user";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";

export type ScheduleActor = AuthenticatedUser & {
  organizationId: string;
  role: "CINEMA_ADMIN" | "LOCATION_MANAGER";
};

export function requireScheduleActor(actor: AuthenticatedUser | null): ScheduleActor {
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  if (!actor.active || (actor.role !== "CINEMA_ADMIN" && actor.role !== "LOCATION_MANAGER")) {
    throw new ServiceError("AUTHORIZATION_DENIED", 403, "Schedule administration access is not permitted.");
  }
  if (!actor.organizationId) throw new ServiceError("TENANT_CONTEXT_MISSING", 403, "Your account is not assigned to an organization.");
  return actor as ScheduleActor;
}

export function requireMovieEditor(actor: ScheduleActor) {
  if (actor.role !== "CINEMA_ADMIN") throw new ServiceError("AUTHORIZATION_DENIED", 403, "Only Cinema Administrators can change the movie catalog.");
}

export function schedulePermittedLocationIds(actor: ScheduleActor): readonly string[] | null {
  return actor.role === "CINEMA_ADMIN" || actor.allLocations ? null : actor.locationIds;
}

export function assertScheduleLocationAccess(actor: ScheduleActor, locationId: string) {
  if (actor.role === "LOCATION_MANAGER" && !actor.allLocations && !actor.locationIds.includes(locationId)) {
    throw new ServiceError("LOCATION_ACCESS_DENIED", 403, "You do not have access to this location.");
  }
}

export async function getScheduleContext() {
  const actor = requireScheduleActor(await getCurrentUser());
  const organization = await getOrganizationById(actor.organizationId);
  if (!organization || organization.status !== "ACTIVE") throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
  return { actor, organization };
}
