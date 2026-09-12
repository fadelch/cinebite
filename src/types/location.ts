import type { DatabaseTimestamp } from "@/types/database";
import type { LocationStatus } from "@/types/status";

export interface Address {
  line1: string;
  line2?: string;
  postalCode?: string;
}

export interface Location {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: LocationStatus;
  address: Address;
  city: string;
  country: string;
  timezone: string;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

/** Parent and document IDs are derived from the Firestore path. */
export type LocationDocument = Omit<Location, "id" | "organizationId">;
