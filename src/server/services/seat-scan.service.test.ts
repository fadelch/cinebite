import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/seat-qr.repository", () => ({ findSeatQrByHashRecord: vi.fn() }));
vi.mock("@/server/repositories/screenings.repository", () => ({ resolveActiveScreeningForSeatRecord: vi.fn() }));

import { createOpaqueToken } from "@/lib/security/opaque-token";
import { resolveActiveScreeningForSeatRecord } from "@/server/repositories/screenings.repository";
import { findSeatQrByHashRecord } from "@/server/repositories/seat-qr.repository";
import { resolveSeatScan } from "@/server/services/seat-scan.service";

const credential = createOpaqueToken();
const seat = {
  id: "seat-a7", label: "A7", row: "A", number: 7, status: "ACTIVE",
  hall: { id: "hall-1", name: "Hall 1", number: 1, status: "ACTIVE", location: { id: "loc-1", name: "Demo Beirut", timezone: "Asia/Beirut", status: "ACTIVE", organization: { id: "org-1", name: "CineBite Demo", status: "ACTIVE" } } },
} as const;

describe("public QR scan resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findSeatQrByHashRecord).mockResolvedValue({ id: "qr-1", hallId: "hall-1", seatId: "seat-a7", status: "ACTIVE", seat } as never);
  });

  it("returns one generic invalid state for random, revoked, inactive-seat, hall, location, and organization credentials", async () => {
    await expect(resolveSeatScan("predictable-seat-id")).resolves.toEqual({ state: "INVALID" });
    vi.mocked(findSeatQrByHashRecord).mockResolvedValueOnce({ id: "qr-1", status: "REVOKED", seat } as never);
    await expect(resolveSeatScan(credential)).resolves.toEqual({ state: "INVALID" });
    for (const inactiveSeat of [
      { ...seat, status: "DISABLED" },
      { ...seat, hall: { ...seat.hall, status: "INACTIVE" } },
      { ...seat, hall: { ...seat.hall, location: { ...seat.hall.location, status: "INACTIVE" } } },
      { ...seat, hall: { ...seat.hall, location: { ...seat.hall.location, organization: { ...seat.hall.location.organization, status: "SUSPENDED" } } } },
    ]) {
      vi.mocked(findSeatQrByHashRecord).mockResolvedValueOnce({ id: "qr-1", hallId: "hall-1", seatId: "seat-a7", status: "ACTIVE", seat: inactiveSeat } as never);
      await expect(resolveSeatScan(credential)).resolves.toEqual({ state: "INVALID" });
    }
    expect(resolveActiveScreeningForSeatRecord).not.toHaveBeenCalled();
  });

  it("reuses Phase 9 resolution and does not create a session during passive GET resolution", async () => {
    vi.mocked(resolveActiveScreeningForSeatRecord).mockResolvedValue({ state: "NO_ACTIVE_SCREENING" });
    await expect(resolveSeatScan(credential)).resolves.toMatchObject({ state: "NO_ACTIVE_SCREENING", seatLabel: "A7" });
    expect(resolveActiveScreeningForSeatRecord).toHaveBeenCalledWith("hall-1", "seat-a7", expect.any(Date));
  });

  it("returns safe confirmation data for a live screening", async () => {
    vi.mocked(resolveActiveScreeningForSeatRecord).mockResolvedValue({
      state: "ACTIVE_SCREENING", organization: { id: "org-1", name: "CineBite Demo" },
      location: { id: "loc-1", name: "Demo Beirut", timezone: "Asia/Beirut" }, hall: { id: "hall-1", name: "Hall 1", number: 1 }, seat: { id: "seat-a7", label: "A7", row: "A", number: 7 },
      screening: { id: "screen-1", startsAt: "2026-09-29T10:00:00.000Z", endsAt: "2026-09-29T12:00:00.000Z", temporalState: "LIVE" },
      movie: { id: "movie-1", title: "Interstellar", durationMinutes: 169, posterUrl: null },
    });
    const result = await resolveSeatScan(credential);
    expect(result).toMatchObject({ state: "READY", context: { movieTitle: "Interstellar", locationName: "Demo Beirut", hallName: "Hall 1", seatLabel: "A7" } });
    expect(JSON.stringify(result)).not.toContain("seat-a7");
  });
});
