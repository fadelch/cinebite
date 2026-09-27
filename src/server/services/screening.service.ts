import "server-only";

import { randomUUID } from "node:crypto";

import { localDateBounds, localDateTimeToInstant, todayInTimeZone } from "@/lib/screenings/timezone";
import { listActiveMoviesRecord } from "@/server/repositories/movies.repository";
import {
  cancelScreeningRecord, createScreeningRecord, getActiveScreeningForHallRecord,
  getScheduleStatsRecord, getScreeningRecord, listScheduleLocationsRecord, listScreeningsRecord,
  resolveActiveScreeningForSeatRecord, screeningDto, updateScreeningRecord,
} from "@/server/repositories/screenings.repository";
import {
  assertScheduleLocationAccess, getScheduleContext, schedulePermittedLocationIds,
} from "@/server/services/schedule-access.service";
import { ServiceError } from "@/server/services/service-error";
import { scheduleListQuerySchema, screeningInputSchema, screeningUpdateSchema } from "@/validation/screening";
import { documentIdSchema } from "@/validation/shared";

function parseLocalTimes(startsAtLocal: string, endsAtLocal: string, timezone: string) {
  try {
    const startsAt = localDateTimeToInstant(startsAtLocal, timezone);
    const endsAt = localDateTimeToInstant(endsAtLocal, timezone);
    if (endsAt <= startsAt) throw new ServiceError("SCREENING_TIME_INVALID", 400, "End time must be after start time.");
    return { startsAt, endsAt };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("SCREENING_TIME_INVALID", 400, error instanceof Error ? error.message : "The screening time is invalid.");
  }
}

export async function getScreeningWorkspace() {
  const { actor, organization } = await getScheduleContext();
  const [locations, movies] = await Promise.all([
    listScheduleLocationsRecord(organization.id, schedulePermittedLocationIds(actor)),
    listActiveMoviesRecord(organization.id),
  ]);
  return { actor, organization, locations, movies };
}

export async function getSchedule(queryInput: unknown) {
  const { actor, organization } = await getScheduleContext();
  const query = scheduleListQuerySchema.parse(queryInput);
  const permittedIds = schedulePermittedLocationIds(actor);
  const locations = await listScheduleLocationsRecord(organization.id, permittedIds);
  const locationId = query.locationId ?? locations[0]?.id;
  const showManageableAcrossDates = query.state === "MANAGEABLE";
  if (!locationId) return { locations, selectedLocationId: null, date: query.date ?? "", screenings: [], total: 0, page: 1, pageSize: query.pageSize, showManageableAcrossDates };
  assertScheduleLocationAccess(actor, locationId);
  const location = locations.find((candidate) => candidate.id === locationId);
  if (!location) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
  const date = query.date ?? todayInTimeZone(location.timezone);
  const bounds = localDateBounds(date, location.timezone);
  const [result, stats] = await Promise.all([
    listScreeningsRecord({
      organizationId: organization.id, permittedIds, locationId, hallId: query.hallId,
      movieId: query.movieId, state: query.state,
      dateStart: showManageableAcrossDates ? undefined : bounds.start,
      dateEnd: showManageableAcrossDates ? undefined : bounds.end,
      page: query.page, pageSize: query.pageSize,
    }),
    getScheduleStatsRecord({ organizationId: organization.id, locationId, dateStart: bounds.start, dateEnd: bounds.end }),
  ]);
  return { ...result, ...stats, locations, selectedLocationId: locationId, date, showManageableAcrossDates };
}

export async function getScreening(screeningIdInput: string) {
  const { actor, organization } = await getScheduleContext();
  const screening = await getScreeningRecord(organization.id, documentIdSchema.parse(screeningIdInput), schedulePermittedLocationIds(actor));
  if (!screening) throw new ServiceError("SCREENING_NOT_FOUND", 404, "Screening not found.");
  return screening;
}

export async function createScreening(input: unknown) {
  const { actor, organization } = await getScheduleContext();
  const value = screeningInputSchema.parse(input);
  assertScheduleLocationAccess(actor, value.locationId);
  const locations = await listScheduleLocationsRecord(organization.id, schedulePermittedLocationIds(actor));
  const location = locations.find((candidate) => candidate.id === value.locationId);
  if (!location) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
  const times = parseLocalTimes(value.startsAtLocal, value.endsAtLocal, location.timezone);
  return createScreeningRecord({ actorUid: actor.uid, organizationId: organization.id, screeningId: randomUUID(), ...value, ...times });
}

export async function updateScreening(screeningIdInput: string, input: unknown) {
  const { actor, organization } = await getScheduleContext();
  const screeningId = documentIdSchema.parse(screeningIdInput);
  const existing = await getScreeningRecord(organization.id, screeningId, schedulePermittedLocationIds(actor));
  if (!existing) throw new ServiceError("SCREENING_NOT_FOUND", 404, "Screening not found.");
  const partial = screeningUpdateSchema.parse(input);
  const value = screeningInputSchema.parse({
    locationId: partial.locationId ?? existing.locationId,
    hallId: partial.hallId ?? existing.hallId,
    movieId: partial.movieId ?? existing.movieId,
    startsAtLocal: partial.startsAtLocal ?? existing.startsAtLocal,
    endsAtLocal: partial.endsAtLocal ?? existing.endsAtLocal,
  });
  assertScheduleLocationAccess(actor, value.locationId);
  const locations = await listScheduleLocationsRecord(organization.id, schedulePermittedLocationIds(actor));
  const location = locations.find((candidate) => candidate.id === value.locationId);
  if (!location) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
  const times = parseLocalTimes(value.startsAtLocal, value.endsAtLocal, location.timezone);
  return updateScreeningRecord({ actorUid: actor.uid, organizationId: organization.id, screeningId, ...value, ...times });
}

export async function cancelScreening(screeningIdInput: string) {
  const { actor, organization } = await getScheduleContext();
  return cancelScreeningRecord({ actorUid: actor.uid, organizationId: organization.id, screeningId: documentIdSchema.parse(screeningIdInput), permittedIds: schedulePermittedLocationIds(actor) });
}

export async function getActiveScreeningForHall(hallIdInput: string, now = new Date()) {
  const row = await getActiveScreeningForHallRecord(documentIdSchema.parse(hallIdInput), now);
  return row ? { state: "ACTIVE_SCREENING" as const, screening: screeningDto(row, now) } : { state: "NO_ACTIVE_SCREENING" as const };
}

export async function resolveActiveScreeningForSeat(hallIdInput: string, seatIdInput: string, now = new Date()) {
  return resolveActiveScreeningForSeatRecord(documentIdSchema.parse(hallIdInput), documentIdSchema.parse(seatIdInput), now);
}
