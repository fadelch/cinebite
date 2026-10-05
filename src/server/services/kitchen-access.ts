import "server-only";

import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";

export type KitchenActor = AuthenticatedUser & {
  organizationId: string;
  role: "KITCHEN_STAFF" | "LOCATION_MANAGER" | "CINEMA_ADMIN";
};

export function requireKitchenActor(actor: AuthenticatedUser | null): KitchenActor {
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Staff sign-in is required.");
  if (!actor.active || !["KITCHEN_STAFF", "LOCATION_MANAGER", "CINEMA_ADMIN"].includes(actor.role)) {
    throw new ServiceError("AUTHORIZATION_DENIED", 403, "Kitchen access is not permitted.");
  }
  if (!actor.organizationId) throw new ServiceError("TENANT_CONTEXT_MISSING", 403, "Your account is not assigned to a cinema.");
  return actor as KitchenActor;
}

export function kitchenPermittedLocationIds(actor: KitchenActor): readonly string[] | null {
  return actor.role === "CINEMA_ADMIN" || actor.allLocations ? null : actor.locationIds;
}

export function assertKitchenLocationAccess(actor: KitchenActor, locationId: string) {
  const permitted = kitchenPermittedLocationIds(actor);
  if (permitted !== null && !permitted.includes(locationId)) {
    throw new ServiceError("LOCATION_ACCESS_DENIED", 403, "You do not have access to this location.");
  }
}
