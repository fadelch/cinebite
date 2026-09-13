import "server-only";

import { getAdminFirestore } from "@/lib/firebase/admin";
import type { AuthenticatedUser } from "@/types/auth";
import type { UserProfile } from "@/types/user";
import { documentIdSchema } from "@/validation/shared";
import { userProfileDocumentSchema } from "@/validation/user";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const validUid = documentIdSchema.parse(uid);
  const snapshot = await getAdminFirestore().collection("users").doc(validUid).get();

  if (!snapshot.exists) {
    return null;
  }

  return {
    uid: snapshot.id,
    ...userProfileDocumentSchema.parse(snapshot.data()),
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
