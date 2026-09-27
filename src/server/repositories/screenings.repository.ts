import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getScreeningTemporalState, type ScreeningTemporalState } from "@/lib/screenings/temporal-state";
import { instantToLocalInput } from "@/lib/screenings/timezone";
import { scheduleActorId } from "@/server/repositories/schedule.repository-utils";
import { ServiceError } from "@/server/services/service-error";
import type { ActiveScreeningResolution, ScheduleLocationDto, ScreeningDto } from "@/types/screening";

const screeningInclude = {
  movie: { select: { id: true, title: true, durationMinutes: true, posterUrl: true, organizationId: true, status: true } },
  hall: { include: { location: { select: { id: true, name: true, timezone: true, organizationId: true, status: true, organization: { select: { id: true, name: true } } } } } },
} as const;

type ScreeningRow = {
  id: string; movieId: string; hallId: string; startsAt: Date; endsAt: Date; status: "SCHEDULED" | "CANCELLED";
  movie: { id: string; title: string; durationMinutes: number; posterUrl: string | null; organizationId: string; status: "ACTIVE" | "INACTIVE" };
  hall: { id: string; name: string; number: number; status: "ACTIVE" | "INACTIVE"; locationId: string; location: { id: string; name: string; timezone: string; organizationId: string; status: "ACTIVE" | "INACTIVE"; organization: { id: string; name: string } } };
};

function screeningDto(row: ScreeningRow, now = new Date()): ScreeningDto {
  return {
    id: row.id, movieId: row.movieId, movieTitle: row.movie.title,
    movieDurationMinutes: row.movie.durationMinutes, posterUrl: row.movie.posterUrl,
    hallId: row.hallId, hallName: row.hall.name, hallNumber: row.hall.number,
    locationId: row.hall.locationId, locationName: row.hall.location.name, timezone: row.hall.location.timezone,
    startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(),
    startsAtLocal: instantToLocalInput(row.startsAt, row.hall.location.timezone),
    endsAtLocal: instantToLocalInput(row.endsAt, row.hall.location.timezone),
    status: row.status,
    temporalState: getScreeningTemporalState({ status: row.status, startsAt: row.startsAt, endsAt: row.endsAt, now }),
  };
}

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "object" && error !== null) {
    const code = "code" in error ? String(error.code) : "";
    const meta = "meta" in error ? JSON.stringify(error.meta) : "";
    return `${code} ${meta}`;
  }
  return "";
}

function mapScreeningWriteError(error: unknown): never {
  const text = errorText(error);
  if (text.includes("screenings_no_scheduled_hall_overlap") || text.includes("23P01")) {
    throw new ServiceError("SCREENING_OVERLAP", 409, "This hall already has a screening during the selected time.");
  }
  throw error;
}

export async function listScheduleLocationsRecord(organizationId: string, permittedIds: readonly string[] | null): Promise<ScheduleLocationDto[]> {
  return prisma.location.findMany({
    where: { organizationId, ...(permittedIds === null ? {} : { id: { in: [...permittedIds] } }) },
    select: { id: true, name: true, timezone: true, status: true, halls: { select: { id: true, name: true, number: true, status: true }, orderBy: { number: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export async function listScreeningsRecord(input: {
  organizationId: string;
  permittedIds: readonly string[] | null;
  locationId?: string;
  hallId?: string;
  movieId?: string;
  state?: ScreeningTemporalState | "MANAGEABLE";
  dateStart?: Date;
  dateEnd?: Date;
  page: number;
  pageSize: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const temporal = input.state === "MANAGEABLE" ? { status: "SCHEDULED" as const, endsAt: { gt: now } }
    : input.state === "CANCELLED" ? { status: "CANCELLED" as const }
    : input.state === "UPCOMING" ? { status: "SCHEDULED" as const, startsAt: { gt: now } }
    : input.state === "LIVE" ? { status: "SCHEDULED" as const, startsAt: { lte: now }, endsAt: { gt: now } }
    : input.state === "ENDED" ? { status: "SCHEDULED" as const, endsAt: { lte: now } }
    : {};
  const where = {
    ...temporal,
    ...(input.movieId ? { movieId: input.movieId } : {}),
    ...(input.dateStart && input.dateEnd ? { startsAt: { ...("startsAt" in temporal ? temporal.startsAt : {}), gte: input.dateStart, lt: input.dateEnd } } : {}),
    ...(input.hallId ? { hallId: input.hallId } : {}),
    hall: { location: {
      organizationId: input.organizationId,
      ...(input.locationId ? { id: input.locationId } : input.permittedIds === null ? {} : { id: { in: [...input.permittedIds] } }),
    } },
  };
  const [rows, total] = await prisma.$transaction([
    prisma.screening.findMany({ where, include: screeningInclude, orderBy: { startsAt: "asc" }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.screening.count({ where }),
  ]);
  return { screenings: rows.map((row) => screeningDto(row, now)), total, page: input.page, pageSize: input.pageSize };
}

export async function getScheduleStatsRecord(input: { organizationId: string; locationId: string; dateStart: Date; dateEnd: Date; now?: Date }) {
  const now = input.now ?? new Date();
  const scope = { hall: { location: { id: input.locationId, organizationId: input.organizationId } } };
  const [liveNow, upcomingToday, cancelledToday] = await prisma.$transaction([
    prisma.screening.count({ where: { ...scope, status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } } }),
    prisma.screening.count({ where: { ...scope, status: "SCHEDULED", startsAt: { gt: now, gte: input.dateStart, lt: input.dateEnd } } }),
    prisma.screening.count({ where: { ...scope, status: "CANCELLED", startsAt: { gte: input.dateStart, lt: input.dateEnd } } }),
  ]);
  return { liveNow, upcomingToday, cancelledToday };
}

export async function getScreeningRecord(organizationId: string, screeningId: string, permittedIds: readonly string[] | null, now = new Date()) {
  const row = await prisma.screening.findFirst({
    where: { id: screeningId, hall: { location: { organizationId, ...(permittedIds === null ? {} : { id: { in: [...permittedIds] } }) } } },
    include: screeningInclude,
  });
  return row ? screeningDto(row, now) : null;
}

async function requireSchedulingResources(tx: Prisma.TransactionClient, input: { organizationId: string; locationId: string; hallId: string; movieId: string }) {
  const [movie, hall] = await Promise.all([
    tx.movie.findFirst({ where: { id: input.movieId, organizationId: input.organizationId } }),
    tx.hall.findFirst({ where: { id: input.hallId, locationId: input.locationId, location: { organizationId: input.organizationId } }, include: { location: true } }),
  ]);
  if (!movie) throw new ServiceError("MOVIE_NOT_FOUND", 404, "Movie not found.");
  if (!hall) throw new ServiceError("HALL_NOT_FOUND", 404, "Hall not found.");
  if (movie.status !== "ACTIVE") throw new ServiceError("SCREENING_RESOURCE_INACTIVE", 409, "Inactive movies cannot be scheduled.");
  if (hall.status !== "ACTIVE") throw new ServiceError("SCREENING_RESOURCE_INACTIVE", 409, "Inactive halls cannot be scheduled.");
  if (hall.location.status !== "ACTIVE") throw new ServiceError("SCREENING_RESOURCE_INACTIVE", 409, "Inactive locations cannot be scheduled.");
  return { movie, hall };
}

async function assertNoFriendlyOverlap(tx: Prisma.TransactionClient, input: { hallId: string; startsAt: Date; endsAt: Date; excludeId?: string }) {
  const overlap = await tx.screening.findFirst({ where: {
    hallId: input.hallId, status: "SCHEDULED", startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt },
    ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
  }, select: { id: true } });
  if (overlap) throw new ServiceError("SCREENING_OVERLAP", 409, "This hall already has a screening during the selected time.");
}

export async function createScreeningRecord(input: {
  actorUid: string; organizationId: string; screeningId: string; locationId: string;
  hallId: string; movieId: string; startsAt: Date; endsAt: Date;
}) {
  const actorUserId = await scheduleActorId(input.actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      await requireSchedulingResources(tx, input);
      await assertNoFriendlyOverlap(tx, input);
      const created = await tx.screening.create({ data: {
        id: input.screeningId, movieId: input.movieId, hallId: input.hallId,
        startsAt: input.startsAt, endsAt: input.endsAt, status: "SCHEDULED",
      }, include: screeningInclude });
      await tx.auditLog.create({ data: {
        actorUserId, action: "SCREENING_CREATED", entityType: "SCREENING", entityId: created.id,
        organizationId: input.organizationId, locationId: input.locationId, hallId: input.hallId,
        metadata: { movieId: input.movieId, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString() },
      } });
      return created;
    });
    return screeningDto(row);
  } catch (error) { mapScreeningWriteError(error); }
}

export async function updateScreeningRecord(input: {
  actorUid: string; organizationId: string; screeningId: string; locationId: string;
  hallId: string; movieId: string; startsAt: Date; endsAt: Date; now?: Date;
}) {
  const actorUserId = await scheduleActorId(input.actorUid);
  const now = input.now ?? new Date();
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.screening.findFirst({ where: { id: input.screeningId, hall: { location: { organizationId: input.organizationId } } }, include: screeningInclude });
      if (!existing) throw new ServiceError("SCREENING_NOT_FOUND", 404, "Screening not found.");
      if (getScreeningTemporalState({ status: existing.status, startsAt: existing.startsAt, endsAt: existing.endsAt, now }) !== "UPCOMING") {
        throw new ServiceError("SCREENING_EDIT_LOCKED", 409, "Only upcoming screenings can change movie, hall, or schedule.");
      }
      await requireSchedulingResources(tx, input);
      await assertNoFriendlyOverlap(tx, { ...input, excludeId: existing.id });
      const updated = await tx.screening.update({ where: { id: existing.id }, data: {
        movieId: input.movieId, hallId: input.hallId, startsAt: input.startsAt, endsAt: input.endsAt,
      }, include: screeningInclude });
      await tx.auditLog.create({ data: {
        actorUserId, action: "SCREENING_UPDATED", entityType: "SCREENING", entityId: existing.id,
        organizationId: input.organizationId, locationId: input.locationId, hallId: input.hallId,
        metadata: { movieId: input.movieId, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString() },
      } });
      return updated;
    });
    return screeningDto(row, now);
  } catch (error) { mapScreeningWriteError(error); }
}

export async function cancelScreeningRecord(input: { actorUid: string; organizationId: string; screeningId: string; permittedIds: readonly string[] | null; now?: Date }) {
  const actorUserId = await scheduleActorId(input.actorUid);
  const now = input.now ?? new Date();
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.screening.findFirst({ where: {
      id: input.screeningId,
      hall: { location: { organizationId: input.organizationId, ...(input.permittedIds === null ? {} : { id: { in: [...input.permittedIds] } }) } },
    }, include: screeningInclude });
    if (!existing) throw new ServiceError("SCREENING_NOT_FOUND", 404, "Screening not found.");
    if (existing.status === "CANCELLED") throw new ServiceError("NO_STATUS_CHANGE", 409, "This screening is already cancelled.");
    if (getScreeningTemporalState({ status: existing.status, startsAt: existing.startsAt, endsAt: existing.endsAt, now }) === "ENDED") {
      throw new ServiceError("SCREENING_EDIT_LOCKED", 409, "Ended screenings are historical and cannot be cancelled.");
    }
    const updated = await tx.screening.update({ where: { id: existing.id }, data: { status: "CANCELLED" }, include: screeningInclude });
    await tx.auditLog.create({ data: {
      actorUserId, action: "SCREENING_CANCELLED", entityType: "SCREENING", entityId: existing.id,
      organizationId: input.organizationId, locationId: existing.hall.locationId, hallId: existing.hallId,
      metadata: { movieId: existing.movieId, startsAt: existing.startsAt.toISOString(), endsAt: existing.endsAt.toISOString() },
    } });
    return updated;
  });
  return screeningDto(row, now);
}

export async function getActiveScreeningForHallRecord(hallId: string, now: Date) {
  return prisma.screening.findFirst({
    where: { hallId, status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } },
    include: screeningInclude,
  });
}

export async function resolveActiveScreeningForSeatRecord(hallId: string, seatId: string, now: Date): Promise<ActiveScreeningResolution> {
  const seat = await prisma.seat.findUnique({
    where: { hallId_id: { hallId, id: seatId } },
    include: { hall: { include: {
      location: { include: { organization: { select: { id: true, name: true } } } },
      screenings: { where: { status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } }, include: { movie: true }, take: 1 },
    } } },
  });
  if (!seat) throw new ServiceError("SEAT_NOT_FOUND", 404, "Seat not found.");
  const screening = seat.hall.screenings[0];
  if (!screening) return { state: "NO_ACTIVE_SCREENING" };
  return {
    state: "ACTIVE_SCREENING",
    organization: seat.hall.location.organization,
    location: { id: seat.hall.location.id, name: seat.hall.location.name, timezone: seat.hall.location.timezone },
    hall: { id: seat.hall.id, name: seat.hall.name, number: seat.hall.number },
    seat: { id: seat.id, label: seat.label, row: seat.row, number: seat.number },
    screening: { id: screening.id, startsAt: screening.startsAt.toISOString(), endsAt: screening.endsAt.toISOString(), temporalState: "LIVE" },
    movie: { id: screening.movie.id, title: screening.movie.title, durationMinutes: screening.movie.durationMinutes, posterUrl: screening.movie.posterUrl },
  };
}

export { screeningDto };
