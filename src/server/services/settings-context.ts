import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/server/auth/current-user";
import { ServiceError } from "./service-error";
import type { AuthenticatedUser } from "@/types/auth";
export async function settingsActor(editor = false) {
  const actor = await getCurrentUser();
  if (!actor)
    throw new ServiceError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Sign in to manage cinema settings.",
    );
  if (
    !actor.organizationId ||
    !actor.active ||
    !["CINEMA_ADMIN", ...(editor ? [] : ["LOCATION_MANAGER"])].includes(
      actor.role,
    )
  )
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Cinema Admin access is required for this action.",
    );
  return actor;
}
/** Shared organization lock serializes staff mutations/last-admin decisions. */
export async function settingsScope(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  editor = false,
  lock = false,
) {
  if (lock)
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${actor.organizationId} FOR UPDATE`;
  const membership = await tx.organizationMembership.findFirst({
    where: {
      organizationId: actor.organizationId!,
      user: { firebaseUid: actor.uid, active: true, platformRole: "USER",authorizationVersion:actor.authorizationVersion??0 },
    },
    include: { user: true, organization: true, locationAccess: true },
  });
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    membership.role !== actor.role ||
    !(editor
      ? membership.role === "CINEMA_ADMIN"
      : ["CINEMA_ADMIN", "LOCATION_MANAGER"].includes(membership.role))
  )
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Your current settings authorization is unavailable.",
    );
  return membership;
}
export function settingsConflict() {
  return new ServiceError(
    "SETTINGS_CONFLICT",
    409,
    "These settings changed. Reload and review the latest values before saving.",
  );
}
