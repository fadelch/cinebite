import "server-only";

import { prisma } from "@/lib/db/prisma";
import { toDatabaseTimestamp } from "@/server/database/mappers";
import type { AuthenticatedUser } from "@/types/auth";
import type { UserProfile } from "@/types/user";
import { documentIdSchema } from "@/validation/shared";

export async function getUserProfile(
  firebaseUidInput: string,
  organizationIdHint?: string | null,
): Promise<UserProfile | null> {
  const firebaseUid = documentIdSchema.parse(firebaseUidInput);
  const user = await prisma.user.findUnique({
    where: { firebaseUid },
    include: {
      memberships: {
        include: { locationAccess: { select: { locationId: true } } },
      },
    },
  });

  if (!user) return null;

  if (user.platformRole === "SUPER_ADMIN") {
    return {
      uid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
      role: "SUPER_ADMIN",
      organizationId: null,
      locationIds: [],
      allLocations: false,
      active: user.active,
      createdAt: toDatabaseTimestamp(user.createdAt),
      updatedAt: toDatabaseTimestamp(user.updatedAt),
    };
  }

  const membership = organizationIdHint
    ? user.memberships.find(
        (candidate) => candidate.organizationId === organizationIdHint,
      )
    : user.memberships.length === 1
      ? user.memberships[0]
      : null;

  if (!membership) return null;

  return {
    uid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    role: membership.role,
    organizationId: membership.organizationId,
    locationIds: membership.locationAccess.map((access) => access.locationId),
    allLocations: membership.allLocations,
    active: user.active,
    createdAt: toDatabaseTimestamp(user.createdAt),
    updatedAt: toDatabaseTimestamp(user.updatedAt),
  };
}

export function toAuthenticatedUser(profile: UserProfile): AuthenticatedUser {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    organizationId: profile.organizationId,
    locationIds: profile.locationIds,
    allLocations: profile.allLocations,
    active: profile.active,
  };
}
