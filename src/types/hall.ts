import type { DatabaseTimestamp } from "@/types/database";
import type { HallStatus } from "@/types/status";

export interface Hall {
  id: string;
  organizationId: string;
  locationId: string;
  name: string;
  number: number;
  status: HallStatus;
  seatCount: number;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

export type HallDocument = Omit<
  Hall,
  "id" | "organizationId" | "locationId"
>;
