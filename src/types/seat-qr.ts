export type SeatQrStatus = "ACTIVE" | "REVOKED";

export interface SeatQrSeatDto {
  id: string;
  label: string;
  row: string;
  number: number;
  seatStatus: "ACTIVE" | "DISABLED";
  qrStatus: SeatQrStatus | "MISSING";
  version: number | null;
  imageAvailable: boolean;
  createdAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
}

export interface SeatQrHallDto {
  organizationName: string;
  locationId: string;
  locationName: string;
  locationStatus: "ACTIVE" | "INACTIVE";
  hallId: string;
  hallName: string;
  hallNumber: number;
  hallStatus: "ACTIVE" | "INACTIVE";
  seats: SeatQrSeatDto[];
}

export interface SeatScanContext {
  organizationName: string;
  locationName: string;
  timezone: string;
  hallName: string;
  hallNumber: number;
  seatLabel: string;
  movieTitle: string;
  moviePosterUrl: string | null;
  startsAt: string;
  endsAt: string;
}

export type SeatScanResult =
  | { state: "INVALID" }
  | { state: "NO_ACTIVE_SCREENING"; organizationName: string; locationName: string; hallName: string; seatLabel: string }
  | { state: "READY"; context: SeatScanContext };
