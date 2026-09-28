import "server-only";

import { hashOpaqueToken } from "@/lib/security/opaque-token";
import { resolveActiveScreeningForSeatRecord } from "@/server/repositories/screenings.repository";
import { findSeatQrByHashRecord } from "@/server/repositories/seat-qr.repository";
import type { SeatScanResult } from "@/types/seat-qr";
import { seatQrCredentialSchema } from "@/validation/seat-qr";

export async function resolveSeatCredential(credentialInput: string, now = new Date()) {
  const parsed = seatQrCredentialSchema.safeParse(credentialInput);
  if (!parsed.success) return null;
  const qr = await findSeatQrByHashRecord(hashOpaqueToken(parsed.data));
  if (!qr || qr.status !== "ACTIVE") return null;
  const { seat } = qr;
  if (
    seat.status !== "ACTIVE" ||
    seat.hall.status !== "ACTIVE" ||
    seat.hall.location.status !== "ACTIVE" ||
    seat.hall.location.organization.status !== "ACTIVE"
  ) return null;
  const active = await resolveActiveScreeningForSeatRecord(qr.hallId, qr.seatId, now);
  return { qr, seat, active };
}

export async function resolveSeatScan(credentialInput: string, now = new Date()): Promise<SeatScanResult> {
  const resolution = await resolveSeatCredential(credentialInput, now);
  if (!resolution) return { state: "INVALID" };
  if (resolution.active.state === "NO_ACTIVE_SCREENING") {
    return {
      state: "NO_ACTIVE_SCREENING",
      organizationName: resolution.seat.hall.location.organization.name,
      locationName: resolution.seat.hall.location.name,
      hallName: resolution.seat.hall.name,
      seatLabel: resolution.seat.label,
    };
  }
  return {
    state: "READY",
    context: {
      organizationName: resolution.active.organization.name,
      locationName: resolution.active.location.name,
      timezone: resolution.active.location.timezone,
      hallName: resolution.active.hall.name,
      hallNumber: resolution.active.hall.number,
      seatLabel: resolution.active.seat.label,
      movieTitle: resolution.active.movie.title,
      moviePosterUrl: resolution.active.movie.posterUrl,
      startsAt: resolution.active.screening.startsAt,
      endsAt: resolution.active.screening.endsAt,
    },
  };
}
