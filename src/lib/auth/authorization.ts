import type { AuthenticatedUser } from "@/types/auth";
import type { OrganizationStatus, UserRole } from "@/types/status";

const ROLE_LANDING_PATHS = {
  SUPER_ADMIN: "/super-admin",
  CINEMA_ADMIN: "/admin",
  LOCATION_MANAGER: "/admin",
  KITCHEN_STAFF: "/kitchen",
  DELIVERY_STAFF: "/delivery",
} as const satisfies Record<UserRole, string>;

export function getLandingPathForRole(role: UserRole): string {
  return ROLE_LANDING_PATHS[role];
}

export function isRoleLandingPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Object.values(ROLE_LANDING_PATHS).some((path) => path === value)
  );
}

export function hasRole(
  user: AuthenticatedUser,
  allowedRoles: readonly UserRole[],
): boolean {
  return user.active && allowedRoles.includes(user.role);
}

export function canAccessOrganization(
  user: AuthenticatedUser,
  organizationId: string,
): boolean {
  if (!user.active) {
    return false;
  }

  return user.role === "SUPER_ADMIN" || user.organizationId === organizationId;
}

export function canAccessLocation(
  user: AuthenticatedUser,
  organizationId: string,
  locationId: string,
): boolean {
  if (!canAccessOrganization(user, organizationId)) {
    return false;
  }

  if (user.role === "SUPER_ADMIN" || user.allLocations) {
    return true;
  }

  return user.locationIds.includes(locationId);
}

export function canUseOrganization(
  user: Pick<AuthenticatedUser, "active" | "organizationId" | "role">,
  organizationStatus: OrganizationStatus | null,
): boolean {
  if (!user.active) {
    return false;
  }

  if (user.role === "SUPER_ADMIN") {
    return true;
  }

  return user.organizationId !== null && organizationStatus === "ACTIVE";
}
