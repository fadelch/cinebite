import type { AuthenticatedUser } from "@/types/auth";
import { ServiceError } from "@/server/services/service-error";

export type SeatQrActor = AuthenticatedUser & {
  organizationId: string;
  role: "CINEMA_ADMIN" | "LOCATION_MANAGER";
};

export function requireSeatQrActor(actor: AuthenticatedUser | null): SeatQrActor {
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  if (!actor.active || (actor.role !== "CINEMA_ADMIN" && actor.role !== "LOCATION_MANAGER")) {
    throw new ServiceError("AUTHORIZATION_DENIED", 403, "Seat QR administration is not permitted.");
  }
  if (!actor.organizationId) throw new ServiceError("TENANT_CONTEXT_MISSING", 403, "Your account is not assigned to an organization.");
  return actor as SeatQrActor;
}

export function assertSeatQrLocationAccess(actor: SeatQrActor, locationId: string): void {
  if (actor.role === "LOCATION_MANAGER" && !actor.allLocations && !actor.locationIds.includes(locationId)) {
    throw new ServiceError("LOCATION_ACCESS_DENIED", 403, "You do not have access to this location.");
  }
}
