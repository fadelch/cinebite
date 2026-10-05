import "server-only";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";
export type DeliveryActor = AuthenticatedUser & { organizationId: string; userId: string; role: "DELIVERY_STAFF" | "LOCATION_MANAGER" | "CINEMA_ADMIN" };
export function requireDeliveryActor(actor: AuthenticatedUser | null, userId: string): DeliveryActor {
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Staff sign-in is required.");
  if (!actor.active || !["DELIVERY_STAFF", "LOCATION_MANAGER", "CINEMA_ADMIN"].includes(actor.role)) throw new ServiceError("AUTHORIZATION_DENIED", 403, "Delivery access is not permitted.");
  if (!actor.organizationId || !userId) throw new ServiceError("TENANT_CONTEXT_MISSING", 403, "Your cinema account is unavailable.");
  return { ...actor, userId } as DeliveryActor;
}
export function deliveryPermittedLocationIds(actor: DeliveryActor): readonly string[] | null { return actor.role === "CINEMA_ADMIN" || actor.allLocations ? null : actor.locationIds; }
export function assertDeliveryLocationAccess(actor: DeliveryActor, locationId: string) {
  const ids = deliveryPermittedLocationIds(actor);
  if (ids !== null && !ids.includes(locationId)) throw new ServiceError("UNAUTHORIZED_LOCATION", 403, "You do not have delivery access to this location.");
}
// Supervisors have scoped oversight, not an implicit claim/completion override.
export function requireDeliveryWorker(actor: DeliveryActor) {
  if (actor.role !== "DELIVERY_STAFF") throw new ServiceError("AUTHORIZATION_DENIED", 403, "Only delivery staff can claim or complete deliveries.");
}
