import type { UserRole } from "@/types/status";

/** Trusted authorization context built only from a verified session and profile. */
export interface AuthenticatedUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  organizationId: string | null;
  locationIds: string[];
  allLocations: boolean;
  active: boolean;
}
