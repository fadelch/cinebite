import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const transaction = {
    movie: { findFirst: vi.fn() },
    hall: { findFirst: vi.fn() },
    screening: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn() }, screening: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() }, seat: { findUnique: vi.fn() }, $transaction: vi.fn(),
    },
    transaction,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database.prisma }));

import {
  cancelScreeningRecord, createScreeningRecord, getActiveScreeningForHallRecord, resolveActiveScreeningForSeatRecord,
  listScreeningsRecord, updateScreeningRecord,
} from "@/server/repositories/screenings.repository";

const startsAt = new Date("2026-10-05T17:00:00.000Z");
const endsAt = new Date("2026-10-05T19:00:00.000Z");
const movie = { id: "movie-1", title: "Interstellar", durationMinutes: 169, posterUrl: null, organizationId: "org-1", status: "ACTIVE" };
const location = { id: "loc-1", name: "Beirut", timezone: "Asia/Beirut", organizationId: "org-1", status: "ACTIVE", organization: { id: "org-1", name: "Cinema" } };
const hall = { id: "hall-1", locationId: "loc-1", name: "Hall 1", number: 1, status: "ACTIVE", location };
const row = { id: "screening-1", movieId: "movie-1", hallId: "hall-1", startsAt, endsAt, status: "SCHEDULED", movie, hall };
const input = { actorUid: "firebase-1", organizationId: "org-1", screeningId: "screening-1", locationId: "loc-1", hallId: "hall-1", movieId: "movie-1", startsAt, endsAt } as const;

describe("screening repository integrity and concurrency boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.prisma.user.findUnique.mockResolvedValue({ id: "user-db-1" });
    database.prisma.$transaction.mockImplementation(async (operation: (client: typeof database.transaction) => unknown) => operation(database.transaction));
    database.transaction.movie.findFirst.mockResolvedValue(movie);
    database.transaction.hall.findFirst.mockResolvedValue(hall);
    database.transaction.screening.findFirst.mockResolvedValue(null);
    database.transaction.screening.create.mockResolvedValue(row);
    database.transaction.screening.update.mockResolvedValue(row);
    database.transaction.auditLog.create.mockResolvedValue({});
  });

  it("validates same-organization active Movie, Hall, and Location and writes AuditLog atomically", async () => {
    await createScreeningRecord(input);
    expect(database.transaction.movie.findFirst).toHaveBeenCalledWith({ where: { id: "movie-1", organizationId: "org-1" } });
    expect(database.transaction.hall.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "hall-1", locationId: "loc-1", location: { organizationId: "org-1" } } }));
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "SCREENING_CREATED", entityType: "SCREENING", organizationId: "org-1", locationId: "loc-1", hallId: "hall-1" }) });
  });

  it("rejects cross-tenant Movie or Hall references before creation", async () => {
    database.transaction.movie.findFirst.mockResolvedValueOnce(null);
    await expect(createScreeningRecord(input)).rejects.toMatchObject({ code: "MOVIE_NOT_FOUND" });
    database.transaction.movie.findFirst.mockResolvedValue(movie); database.transaction.hall.findFirst.mockResolvedValueOnce(null);
    await expect(createScreeningRecord(input)).rejects.toMatchObject({ code: "HALL_NOT_FOUND" });
    expect(database.transaction.screening.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...movie, status: "INACTIVE" }, hall, "Inactive movies cannot be scheduled."],
    [movie, { ...hall, status: "INACTIVE" }, "Inactive halls cannot be scheduled."],
    [movie, { ...hall, location: { ...location, status: "INACTIVE" } }, "Inactive locations cannot be scheduled."],
  ])("rejects inactive scheduling resources", async (movieValue, hallValue, message) => {
    database.transaction.movie.findFirst.mockResolvedValue(movieValue);
    database.transaction.hall.findFirst.mockResolvedValue(hallValue);
    await expect(createScreeningRecord(input)).rejects.toMatchObject({ code: "SCREENING_RESOURCE_INACTIVE", message });
  });

  it("detects same-Hall partial and containment overlaps using strict interval comparisons", async () => {
    database.transaction.screening.findFirst.mockResolvedValue({ id: "existing" });
    await expect(createScreeningRecord(input)).rejects.toMatchObject({ code: "SCREENING_OVERLAP", status: 409 });
    expect(database.transaction.screening.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ hallId: "hall-1", status: "SCHEDULED", startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }), select: { id: true } });
    expect(database.transaction.screening.create).not.toHaveBeenCalled();
  });

  it("accepts adjacency and overlaps in different Halls/Locations when the scoped overlap query finds none", async () => {
    await expect(createScreeningRecord(input)).resolves.toMatchObject({ id: "screening-1" });
    expect(database.transaction.screening.create).toHaveBeenCalledTimes(1);
  });

  it("maps the PostgreSQL exclusion constraint race failure to a friendly conflict", async () => {
    database.transaction.screening.create.mockRejectedValue(new Error('constraint "screenings_no_scheduled_hall_overlap" 23P01'));
    await expect(createScreeningRecord(input)).rejects.toMatchObject({ code: "SCREENING_OVERLAP", status: 409 });
    expect(database.transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    [new Date("2026-10-05T17:30:00.000Z"), "LIVE"],
    [new Date("2026-10-05T19:00:00.000Z"), "ENDED"],
  ] as const)("locks core edits at %s when state is %s", async (now, state) => {
    database.transaction.screening.findFirst.mockResolvedValueOnce(row);
    await expect(updateScreeningRecord({ ...input, now })).rejects.toMatchObject({ code: "SCREENING_EDIT_LOCKED" });
    expect(["LIVE", "ENDED"]).toContain(state);
    expect(database.transaction.screening.update).not.toHaveBeenCalled();
  });

  it("reruns overlap validation for an upcoming edit and excludes the edited row", async () => {
    database.transaction.screening.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    await updateScreeningRecord({ ...input, now: new Date("2026-10-05T16:00:00.000Z") });
    expect(database.transaction.screening.findFirst).toHaveBeenLastCalledWith({ where: expect.objectContaining({ id: { not: "screening-1" } }), select: { id: true } });
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "SCREENING_UPDATED" }) });
  });

  it("queries active Hall screening with exact start-inclusive/end-exclusive boundaries", async () => {
    database.prisma.screening.findFirst.mockResolvedValue(row);
    const now = new Date("2026-10-05T17:00:00.000Z");
    await getActiveScreeningForHallRecord("hall-1", now);
    expect(database.prisma.screening.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { hallId: "hall-1", status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } } }));
  });

  it("lists upcoming and live screenings across all dates for the management view", async () => {
    const now = new Date("2026-10-05T17:30:00.000Z");
    database.prisma.$transaction.mockResolvedValueOnce([[], 0]);
    await listScreeningsRecord({
      organizationId: "org-1",
      permittedIds: null,
      locationId: "loc-1",
      state: "MANAGEABLE",
      page: 1,
      pageSize: 30,
      now,
    });
    expect(database.prisma.screening.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "SCHEDULED", endsAt: { gt: now } }),
    }));
    const call = database.prisma.screening.findMany.mock.calls[0]?.[0];
    expect(call?.where).not.toHaveProperty("startsAt");
  });

  it("cancels an upcoming or live Screening, preserves it, and audits the transition", async () => {
    database.transaction.screening.findFirst.mockResolvedValueOnce(row);
    database.transaction.screening.update.mockResolvedValue({ ...row, status: "CANCELLED" });
    await cancelScreeningRecord({ actorUid: "firebase-1", organizationId: "org-1", screeningId: "screening-1", permittedIds: ["loc-1"], now: new Date("2026-10-05T17:30:00.000Z") });
    expect(database.transaction.screening.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "CANCELLED" } }));
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "SCREENING_CANCELLED" }) });
  });

  it("keeps ended Screenings historical and rejects repeat cancellation", async () => {
    database.transaction.screening.findFirst.mockResolvedValueOnce(row);
    await expect(cancelScreeningRecord({ actorUid: "firebase-1", organizationId: "org-1", screeningId: "screening-1", permittedIds: null, now: endsAt })).rejects.toMatchObject({ code: "SCREENING_EDIT_LOCKED" });
    database.transaction.screening.findFirst.mockResolvedValueOnce({ ...row, status: "CANCELLED" });
    await expect(cancelScreeningRecord({ actorUid: "firebase-1", organizationId: "org-1", screeningId: "screening-1", permittedIds: null, now: startsAt })).rejects.toMatchObject({ code: "NO_STATUS_CHANGE" });
  });

  it("resolves safe Organization/Location/Hall/Seat/Movie context or explicit no-active state", async () => {
    database.prisma.seat.findUnique.mockResolvedValue({ id: "a7", label: "A7", row: "A", number: 7, hall: { ...hall, screenings: [{ ...row, movie }] } });
    await expect(resolveActiveScreeningForSeatRecord("hall-1", "a7", startsAt)).resolves.toMatchObject({ state: "ACTIVE_SCREENING", organization: { id: "org-1" }, location: { id: "loc-1" }, hall: { id: "hall-1" }, seat: { label: "A7" }, movie: { title: "Interstellar" } });
    database.prisma.seat.findUnique.mockResolvedValue({ id: "a7", label: "A7", row: "A", number: 7, hall: { ...hall, screenings: [] } });
    await expect(resolveActiveScreeningForSeatRecord("hall-1", "a7", startsAt)).resolves.toEqual({ state: "NO_ACTIVE_SCREENING" });
  });
});
