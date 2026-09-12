import "server-only";

import {
  canAccessLocation,
  canAccessOrganization,
  hasRole,
} from "@/lib/auth/authorization";
import { getCurrentUser } from "@/server/auth/current-user";
import type { AuthenticatedUser } from "@/types/auth";
import type { UserRole } from "@/types/status";
import { documentIdSchema } from "@/validation/shared";

export class AuthenticationRequiredError extends Error {
  readonly status = 401;
}

export class AuthorizationDeniedError extends Error {
  readonly status = 403;
}

export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationRequiredError("Authentication required.");
  }

  return user;
}

export async function requireRole(
  ...allowedRoles: readonly UserRole[]
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  if (!hasRole(user, allowedRoles)) {
    throw new AuthorizationDeniedError("Role access denied.");
  }

  return user;
}

export async function requireOrganizationAccess(
  organizationId: string,
): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  const validOrganizationId = documentIdSchema.parse(organizationId);

  if (!canAccessOrganization(user, validOrganizationId)) {
    throw new AuthorizationDeniedError("Organization access denied.");
  }

  return user;
}

export async function requireLocationAccess(
  organizationId: string,
  locationId: string,
): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  const validOrganizationId = documentIdSchema.parse(organizationId);
  const validLocationId = documentIdSchema.parse(locationId);

  if (!canAccessLocation(user, validOrganizationId, validLocationId)) {
    throw new AuthorizationDeniedError("Location access denied.");
  }

  return user;
}
