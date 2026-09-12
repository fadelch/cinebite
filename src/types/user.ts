import type { DatabaseTimestamp } from "@/types/database";
import type { UserRole } from "@/types/status";

export interface UserProfile {
  uid: string;
  organizationId: string | null;
  locationIds: string[];
  allLocations: boolean;
  role: UserRole;
  active: boolean;
  displayName: string;
  email: string;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

/** The profile UID is derived from the users/{uid} document path. */
export type UserProfileDocument = Omit<UserProfile, "uid">;
