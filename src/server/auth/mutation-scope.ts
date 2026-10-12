import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ServiceError } from "@/server/services/service-error";
import { requestAuthorizationVersion } from "./authorization-context";

/** Platform provisioning rechecks the current trusted operator at commit. */
export async function assertPlatformMutation(
  tx: Prisma.TransactionClient,
  uid: string,
) {
  await tx.$queryRaw`SELECT id FROM users WHERE "firebaseUid"=${uid} FOR SHARE`;
  const version = requestAuthorizationVersion(uid);
  const user = await tx.user.findFirst({
    where: {
      firebaseUid: uid,
      active: true,
      platformRole: "SUPER_ADMIN",
      ...(version === undefined ? {} : { authorizationVersion: version }),
    },
    select: { id: true },
  });
  if (!user)
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Current platform authorization is required.",
    );
}

/** Recheck slow legacy operations at their commit boundary, not only before an upload. */
export async function assertMutationActor(
  tx: Prisma.TransactionClient,
  uid: string,
  org: string,
  locationId?: string,
  editor = false,
) {
  // Staff lifecycle locks this organization first. SHARE protects current authorization
  // until commit without serializing ordinary mutations against one another.
  await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM users WHERE "firebaseUid"=${uid} FOR SHARE`;
  const version = requestAuthorizationVersion(uid);
  const membership = await tx.organizationMembership.findFirst({
    where: {
      organizationId: org,
      organization: { status: "ACTIVE" },
      user: {
        firebaseUid: uid,
        active: true,
        platformRole: "USER",
        ...(version === undefined ? {} : { authorizationVersion: version }),
      },
      role: {
        in: editor ? ["CINEMA_ADMIN"] : ["CINEMA_ADMIN", "LOCATION_MANAGER"],
      },
    },
    include: { locationAccess: true },
  });
  if (
    !membership ||
    (locationId &&
      membership.role !== "CINEMA_ADMIN" &&
      !membership.allLocations &&
      !membership.locationAccess.some(
        (access) => access.locationId === locationId,
      ))
  )
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Your current authorization does not permit this change.",
    );
}
