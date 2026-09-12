import type { DatabaseTimestamp } from "@/types/database";
import type { SeatStatus } from "@/types/status";

export interface Seat {
  id: string;
  organizationId: string;
  locationId: string;
  hallId: string;
  row: string;
  number: number;
  label: string;
  status: SeatStatus;
  createdAt: DatabaseTimestamp;
  updatedAt: DatabaseTimestamp;
}

export type SeatDocument = Omit<
  Seat,
  "id" | "organizationId" | "locationId" | "hallId"
>;
