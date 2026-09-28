import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/seat-scan.service", () => ({ resolveSeatCredential: vi.fn() }));
vi.mock("@/server/repositories/customer-session.repository", () => ({
  createCustomerSessionRecord: vi.fn(), getCustomerSessionByHashRecord: vi.fn(), revokeCustomerSessionByHashRecord: vi.fn(), touchCustomerSessionRecord: vi.fn(),
}));

import { createOpaqueToken } from "@/lib/security/opaque-token";
import { createCustomerSessionRecord, getCustomerSessionByHashRecord, revokeCustomerSessionByHashRecord, touchCustomerSessionRecord } from "@/server/repositories/customer-session.repository";
import { startCustomerSession, validateCustomerSession } from "@/server/services/customer-session.service";
import { resolveSeatCredential } from "@/server/services/seat-scan.service";

const credential = createOpaqueToken();
const now = new Date("2026-09-29T10:30:00.000Z");
const active = {
  state: "ACTIVE_SCREENING", organization: { id: "org-1", name: "Demo" }, location: { id: "loc-1", name: "Beirut", timezone: "Asia/Beirut" }, hall: { id: "hall-1", name: "Hall 1", number: 1 }, seat: { id: "seat-a7", label: "A7", row: "A", number: 7 }, screening: { id: "screen-1", startsAt: "2026-09-29T10:00:00.000Z", endsAt: "2026-09-29T12:00:00.000Z", temporalState: "LIVE" }, movie: { id: "movie-1", title: "Interstellar", durationMinutes: 169, posterUrl: null },
} as const;
const persisted = {
  id: "session-1", tokenHash: "a".repeat(64), status: "ACTIVE", hallId: "hall-1", seatId: "seat-a7", screeningId: "screen-1", expiresAt: new Date("2026-09-29T12:15:00.000Z"), lastSeenAt: null,
  seat: { id: "seat-a7", label: "A7", status: "ACTIVE", hall: { id: "hall-1", name: "Hall 1", status: "ACTIVE", location: { id: "loc-1", name: "Beirut", organizationId: "org-1", status: "ACTIVE", organization: { status: "ACTIVE" } } } },
  screening: { id: "screen-1", hallId: "hall-1", status: "SCHEDULED", startsAt: new Date("2026-09-29T10:00:00.000Z"), endsAt: new Date("2026-09-29T12:00:00.000Z"), movie: { title: "Interstellar" } },
} as const;

describe("anonymous customer sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(revokeCustomerSessionByHashRecord).mockResolvedValue({ count: 1 });
    vi.mocked(touchCustomerSessionRecord).mockResolvedValue(undefined);
  });

  it("binds a new token to the trusted Seat and LIVE Screening without accepting client IDs", async () => {
    vi.mocked(resolveSeatCredential).mockResolvedValue({ qr: {}, seat: {}, active } as never);
    vi.mocked(createCustomerSessionRecord).mockResolvedValue(persisted as never);
    const result = await startCustomerSession({ credential, seatId: "attacker-seat", screeningId: "attacker-screen" }, now);
    expect(result.rawToken).toHaveLength(43);
    expect(createCustomerSessionRecord).toHaveBeenCalledWith(expect.objectContaining({ hallId: "hall-1", seatId: "seat-a7", screeningId: "screen-1", tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });

  it("refuses invalid QR and no-active-screening contexts", async () => {
    vi.mocked(resolveSeatCredential).mockResolvedValueOnce(null);
    await expect(startCustomerSession({ credential }, now)).rejects.toMatchObject({ code: "CUSTOMER_SESSION_INVALID" });
    vi.mocked(resolveSeatCredential).mockResolvedValueOnce({ qr: {}, seat: {}, active: { state: "NO_ACTIVE_SCREENING" } } as never);
    await expect(startCustomerSession({ credential }, now)).rejects.toMatchObject({ code: "NO_ACTIVE_SCREENING" });
  });

  it("rejects expiry, revocation, cancellation, ended screening, and a switched Hall", async () => {
    for (const value of [
      { ...persisted, status: "REVOKED" },
      { ...persisted, expiresAt: now },
      { ...persisted, screening: { ...persisted.screening, status: "CANCELLED" } },
      { ...persisted, screening: { ...persisted.screening, endsAt: now } },
      { ...persisted, screening: { ...persisted.screening, hallId: "hall-2" } },
    ]) {
      vi.mocked(getCustomerSessionByHashRecord).mockResolvedValueOnce(value as never);
      await expect(validateCustomerSession(createOpaqueToken(), now)).rejects.toMatchObject({ code: expect.stringMatching(/^CUSTOMER_SESSION_/) });
    }
    expect(revokeCustomerSessionByHashRecord).toHaveBeenCalled();
  });

  it("accepts only the persisted Seat and Screening binding", async () => {
    vi.mocked(getCustomerSessionByHashRecord).mockResolvedValue(persisted as never);
    await expect(validateCustomerSession(createOpaqueToken(), now)).resolves.toMatchObject({ seatId: "seat-a7", screeningId: "screen-1" });
  });
});
