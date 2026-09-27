import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/repositories/organizations.repository", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/server/media/movie-poster", () => ({ storeMoviePoster: vi.fn(), deleteMoviePoster: vi.fn() }));
vi.mock("@/server/repositories/movies.repository", () => ({
  createMovieRecord: vi.fn(), getMoviePosterRecord: vi.fn(), getMovieRecord: vi.fn(),
  listActiveMoviesRecord: vi.fn(), listMoviesRecord: vi.fn(), setMoviePosterRecord: vi.fn(), updateMovieRecord: vi.fn(),
}));
vi.mock("@/server/repositories/screenings.repository", () => ({
  cancelScreeningRecord: vi.fn(), createScreeningRecord: vi.fn(), getActiveScreeningForHallRecord: vi.fn(),
  getScheduleStatsRecord: vi.fn(), getScreeningRecord: vi.fn(), listScheduleLocationsRecord: vi.fn(),
  listScreeningsRecord: vi.fn(), resolveActiveScreeningForSeatRecord: vi.fn(), screeningDto: vi.fn(), updateScreeningRecord: vi.fn(),
}));

import { getCurrentUser } from "@/server/auth/current-user";
import { createMovieRecord } from "@/server/repositories/movies.repository";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import { createScreeningRecord, getScheduleStatsRecord, listScheduleLocationsRecord, listScreeningsRecord } from "@/server/repositories/screenings.repository";
import { createMovie } from "@/server/services/movie.service";
import { assertScheduleLocationAccess, requireMovieEditor, requireScheduleActor } from "@/server/services/schedule-access.service";
import { createScreening, getSchedule } from "@/server/services/screening.service";
import type { AuthenticatedUser } from "@/types/auth";

const admin: AuthenticatedUser = { uid: "admin", email: "admin@example.com", displayName: "Admin", role: "CINEMA_ADMIN", organizationId: "org-1", locationIds: [], allLocations: true, active: true };
const manager: AuthenticatedUser = { ...admin, uid: "manager", role: "LOCATION_MANAGER", locationIds: ["loc-1"], allLocations: false };
const location = { id: "loc-1", name: "Beirut", timezone: "Asia/Beirut", status: "ACTIVE", halls: [{ id: "hall-1", name: "Hall 1", number: 1, status: "ACTIVE" }] } as const;

describe("Phase 9 movie and schedule authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrganizationById).mockResolvedValue({ id: "org-1", status: "ACTIVE" } as never);
    vi.mocked(listScheduleLocationsRecord).mockResolvedValue([location] as never);
    vi.mocked(listScreeningsRecord).mockResolvedValue({ screenings: [], total: 0, page: 1, pageSize: 30 } as never);
    vi.mocked(getScheduleStatsRecord).mockResolvedValue({ liveNow: 0, upcomingToday: 0, cancelledToday: 0 });
  });

  it("allows Cinema Admin movie creation in the authenticated tenant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(createMovieRecord).mockResolvedValue({ id: "movie-1" } as never);
    await createMovie({ title: "Interstellar", slug: "interstellar", durationMinutes: 169 });
    expect(createMovieRecord).toHaveBeenCalledWith(expect.objectContaining({ actorUid: "admin", organizationId: "org-1", movie: expect.objectContaining({ durationMinutes: 169 }) }));
  });

  it("prevents Location Manager from creating or editing global movies", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager);
    await expect(createMovie({ title: "Interstellar", slug: "interstellar", durationMinutes: 169 })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(createMovieRecord).not.toHaveBeenCalled();
    expect(() => requireMovieEditor(requireScheduleActor(manager))).toThrow();
  });

  it("allows a Location Manager to schedule only an assigned location", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager);
    vi.mocked(createScreeningRecord).mockResolvedValue({ id: "screening-1" } as never);
    await createScreening({ locationId: "loc-1", hallId: "hall-1", movieId: "movie-1", startsAtLocal: "2026-10-05T20:30", endsAtLocal: "2026-10-05T23:19" });
    expect(createScreeningRecord).toHaveBeenCalledWith(expect.objectContaining({ actorUid: "manager", organizationId: "org-1", locationId: "loc-1", startsAt: new Date("2026-10-05T17:30:00.000Z") }));
    await expect(createScreening({ locationId: "loc-2", hallId: "hall-2", movieId: "movie-1", startsAtLocal: "2026-10-05T20:30", endsAtLocal: "2026-10-05T23:19" })).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
  });

  it("rejects end-before-start before repository mutation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    await expect(createScreening({ locationId: "loc-1", hallId: "hall-1", movieId: "movie-1", startsAtLocal: "2026-10-05T20:30", endsAtLocal: "2026-10-05T19:30" })).rejects.toMatchObject({ code: "SCREENING_TIME_INVALID" });
    expect(createScreeningRecord).not.toHaveBeenCalled();
  });

  it("returns all upcoming and live screenings without a date boundary in management mode", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    const result = await getSchedule({ state: "MANAGEABLE" });
    expect(listScreeningsRecord).toHaveBeenCalledWith(expect.objectContaining({
      state: "MANAGEABLE",
      dateStart: undefined,
      dateEnd: undefined,
    }));
    expect(result.showManageableAcrossDates).toBe(true);
  });

  it("denies unauthorized location, kitchen, delivery, inactive, and anonymous actors", () => {
    expect(() => assertScheduleLocationAccess(requireScheduleActor(manager), "loc-2")).toThrow();
    expect(() => requireScheduleActor({ ...manager, role: "KITCHEN_STAFF" })).toThrow();
    expect(() => requireScheduleActor({ ...manager, role: "DELIVERY_STAFF" })).toThrow();
    expect(() => requireScheduleActor({ ...manager, active: false })).toThrow();
    expect(() => requireScheduleActor(null)).toThrow();
  });
});
