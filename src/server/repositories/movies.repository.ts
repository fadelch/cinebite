import "server-only";

import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { scheduleActorId } from "@/server/repositories/schedule.repository-utils";
import { ServiceError } from "@/server/services/service-error";
import type { MovieDto } from "@/types/screening";
import type { movieInputSchema, movieListQuerySchema, movieUpdateSchema } from "@/validation/screening";

type MovieInput = ReturnType<typeof movieInputSchema.parse>;
type MovieUpdate = ReturnType<typeof movieUpdateSchema.parse>;
type MovieQuery = ReturnType<typeof movieListQuerySchema.parse>;

const movieInclude = (now: Date) => ({
  _count: { select: { screenings: { where: { status: "SCHEDULED" as const, startsAt: { gte: now } } } } },
});

function movieDto(row: {
  id: string; title: string; slug: string; synopsis: string | null; durationMinutes: number;
  language: string | null; contentRating: string | null; status: "ACTIVE" | "INACTIVE";
  posterUrl: string | null; updatedAt: Date; _count: { screenings: number };
}): MovieDto {
  return {
    id: row.id, title: row.title, slug: row.slug, synopsis: row.synopsis,
    durationMinutes: row.durationMinutes, language: row.language, contentRating: row.contentRating,
    status: row.status, posterUrl: row.posterUrl, upcomingScreeningCount: row._count.screenings,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMovieError(error: unknown): never {
  if (isPrismaError(error, "P2002")) throw new ServiceError("DUPLICATE_MOVIE_SLUG", 409, "This movie slug is already in use.");
  throw error;
}

export async function listMoviesRecord(organizationId: string, query: MovieQuery, now = new Date()) {
  const where = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { OR: [
      { title: { contains: query.search, mode: "insensitive" as const } },
      { slug: { contains: query.search, mode: "insensitive" as const } },
      { language: { contains: query.search, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.movie.findMany({ where, include: movieInclude(now), orderBy: [{ status: "asc" }, { title: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.movie.count({ where }),
  ]);
  return { movies: rows.map(movieDto), total, page: query.page, pageSize: query.pageSize };
}

export async function listActiveMoviesRecord(organizationId: string, now = new Date()) {
  const rows = await prisma.movie.findMany({ where: { organizationId, status: "ACTIVE" }, include: movieInclude(now), orderBy: { title: "asc" } });
  return rows.map(movieDto);
}

export async function getMovieRecord(organizationId: string, movieId: string, now = new Date()) {
  const row = await prisma.movie.findFirst({ where: { id: movieId, organizationId }, include: movieInclude(now) });
  return row ? movieDto(row) : null;
}

export async function createMovieRecord(input: { actorUid: string; organizationId: string; movieId: string; movie: MovieInput; poster?: { storagePath: string; url: string } }) {
  const actorUserId = await scheduleActorId(input.actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.movie.create({ data: {
        id: input.movieId, organizationId: input.organizationId, ...input.movie,
        posterStoragePath: input.poster?.storagePath, posterUrl: input.poster?.url,
      }, include: movieInclude(new Date()) });
      await tx.auditLog.create({ data: {
        actorUserId, action: "MOVIE_CREATED", entityType: "MOVIE", entityId: created.id,
        organizationId: input.organizationId, metadata: { slug: created.slug, durationMinutes: created.durationMinutes },
      } });
      return created;
    });
    return movieDto(row);
  } catch (error) { mapMovieError(error); }
}

export async function updateMovieRecord(input: { actorUid: string; organizationId: string; movieId: string; movie: MovieUpdate }) {
  const actorUserId = await scheduleActorId(input.actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.movie.findFirst({ where: { id: input.movieId, organizationId: input.organizationId } });
      if (!existing) throw new ServiceError("MOVIE_NOT_FOUND", 404, "Movie not found.");
      const updated = await tx.movie.update({ where: { id: existing.id }, data: input.movie, include: movieInclude(new Date()) });
      const action = input.movie.status && input.movie.status !== existing.status
        ? input.movie.status === "ACTIVE" ? "MOVIE_ENABLED" : "MOVIE_DISABLED"
        : "MOVIE_UPDATED";
      await tx.auditLog.create({ data: {
        actorUserId, action, entityType: "MOVIE", entityId: existing.id,
        organizationId: input.organizationId, metadata: { changedFields: Object.keys(input.movie) },
      } });
      return updated;
    });
    return movieDto(row);
  } catch (error) { mapMovieError(error); }
}

export async function getMoviePosterRecord(organizationId: string, movieId: string) {
  return prisma.movie.findFirst({ where: { id: movieId, organizationId }, select: { id: true, posterStoragePath: true, posterUrl: true } });
}

export async function setMoviePosterRecord(input: { actorUid: string; organizationId: string; movieId: string; poster: { storagePath: string; url: string } | null }) {
  const actorUserId = await scheduleActorId(input.actorUid);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.movie.findFirst({ where: { id: input.movieId, organizationId: input.organizationId }, select: { id: true, posterStoragePath: true } });
    if (!existing) throw new ServiceError("MOVIE_NOT_FOUND", 404, "Movie not found.");
    const movie = await tx.movie.update({ where: { id: existing.id }, data: { posterStoragePath: input.poster?.storagePath ?? null, posterUrl: input.poster?.url ?? null } });
    await tx.auditLog.create({ data: {
      actorUserId, action: input.poster ? "MOVIE_POSTER_UPDATED" : "MOVIE_POSTER_REMOVED",
      entityType: "MOVIE", entityId: existing.id, organizationId: input.organizationId,
      metadata: { hasPoster: Boolean(input.poster) },
    } });
    return { oldPath: existing.posterStoragePath, movie };
  });
}
