import type { DatabaseTimestamp } from "@/types/database";
import type { UserRole } from "@/types/status";

export interface UserProfile {
  id: string;
  organizationId: string;
  locationIds: string[];
  role: UserRole;
  active: boolean;
  displayName: string;
  email: string;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

/** The profile ID will be the Firebase Authentication UID in Phase 3. */
export type UserProfileDocument = Omit<UserProfile, "id">;
