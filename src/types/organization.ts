import type { DatabaseTimestamp } from "@/types/database";
import type { OrganizationStatus } from "@/types/status";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

/** The persisted document excludes its Firestore document ID. */
export type OrganizationDocument = Omit<Organization, "id">;
