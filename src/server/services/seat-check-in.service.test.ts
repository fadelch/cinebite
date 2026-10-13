import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/repositories/seat-check-in.repository", () => ({ issueSeatCheckInRecord: vi.fn() }));
import { getCurrentUser } from "@/server/auth/current-user";
import { issueSeatCheckInRecord } from "@/server/repositories/seat-check-in.repository";
import { issueSeatCheckIn } from "./seat-check-in.service";

const input = { ticketVerified: true, ticketReference: "synthetic-ticket" };
const admin = { uid: "admin", role: "CINEMA_ADMIN", active: true, organizationId: "cinema-a", allLocations: true, locationIds: [] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCurrentUser).mockResolvedValue(admin as never); });

it.each([null, { ...admin, active: false }, { ...admin, role: "SUPER_ADMIN" }, { ...admin, role: "KITCHEN" }, { ...admin, role: "DELIVERY" }])("denies issuance without an active scoped ticket-check-in operator", async actor => {
  vi.mocked(getCurrentUser).mockResolvedValue(actor as never);
  await expect(issueSeatCheckIn("location", "hall", "seat", input)).rejects.toMatchObject({ status: expect.any(Number) });
  expect(issueSeatCheckInRecord).not.toHaveBeenCalled();
});
it("denies a manager outside their permitted locations", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ ...admin, role: "LOCATION_MANAGER", allLocations: false, locationIds: ["another-location"] } as never);
  await expect(issueSeatCheckIn("location", "hall", "seat", input)).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
  expect(issueSeatCheckInRecord).not.toHaveBeenCalled();
});
it.each([{ ...input, ticketVerified: false }, { ticketVerified: true }, { ...input, screeningId: "attacker-screening" }])("requires a verified ticket reference and rejects client screening overrides", async value => {
  await expect(issueSeatCheckIn("location", "hall", "seat", value)).rejects.toThrow();
  expect(issueSeatCheckInRecord).not.toHaveBeenCalled();
});
it("takes tenant identity from the trusted actor and defaults to no session replacement", async () => {
  await issueSeatCheckIn("location", "hall", "seat", input);
  expect(issueSeatCheckInRecord).toHaveBeenCalledWith({ actorUid: "admin", organizationId: "cinema-a", locationId: "location", hallId: "hall", seatId: "seat", ticketReference: "synthetic-ticket", replaceExistingSession: false });
});
