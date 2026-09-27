import "server-only";

import { randomUUID } from "node:crypto";

import { deleteMoviePoster, storeMoviePoster } from "@/server/media/movie-poster";
import {
  createMovieRecord, getMoviePosterRecord, getMovieRecord, listMoviesRecord,
  setMoviePosterRecord, updateMovieRecord,
} from "@/server/repositories/movies.repository";
import { getScheduleContext, requireMovieEditor } from "@/server/services/schedule-access.service";
import { ServiceError } from "@/server/services/service-error";
import { movieInputSchema, movieListQuerySchema, movieUpdateSchema } from "@/validation/screening";
import { documentIdSchema } from "@/validation/shared";

export async function getMovies(queryInput: unknown) {
  const { organization } = await getScheduleContext();
  return listMoviesRecord(organization.id, movieListQuerySchema.parse(queryInput));
}

export async function getMovie(movieIdInput: string) {
  const { actor, organization } = await getScheduleContext();
  const movie = await getMovieRecord(organization.id, documentIdSchema.parse(movieIdInput));
  if (!movie) throw new ServiceError("MOVIE_NOT_FOUND", 404, "Movie not found.");
  return { movie, canEdit: actor.role === "CINEMA_ADMIN" };
}

export async function createMovie(input: unknown, posterFile?: File | null) {
  const { actor, organization } = await getScheduleContext();
  requireMovieEditor(actor);
  const movieId = randomUUID();
  const movie = movieInputSchema.parse(input);
  let poster: Awaited<ReturnType<typeof storeMoviePoster>> | undefined;
  try {
    if (posterFile && posterFile.size > 0) poster = await storeMoviePoster(organization.id, movieId, posterFile);
    return await createMovieRecord({ actorUid: actor.uid, organizationId: organization.id, movieId, movie, poster });
  } catch (error) {
    if (poster) await deleteMoviePoster(organization.id, movieId, poster.storagePath).catch(() => undefined);
    throw error;
  }
}

export async function updateMovie(movieIdInput: string, input: unknown) {
  const { actor, organization } = await getScheduleContext();
  requireMovieEditor(actor);
  return updateMovieRecord({ actorUid: actor.uid, organizationId: organization.id, movieId: documentIdSchema.parse(movieIdInput), movie: movieUpdateSchema.parse(input) });
}

export async function replaceMoviePoster(movieIdInput: string, file: File) {
  const { actor, organization } = await getScheduleContext();
  requireMovieEditor(actor);
  const movieId = documentIdSchema.parse(movieIdInput);
  const existing = await getMoviePosterRecord(organization.id, movieId);
  if (!existing) throw new ServiceError("MOVIE_NOT_FOUND", 404, "Movie not found.");
  const uploaded = await storeMoviePoster(organization.id, movieId, file);
  try {
    const result = await setMoviePosterRecord({ actorUid: actor.uid, organizationId: organization.id, movieId, poster: uploaded });
    if (result.oldPath && result.oldPath !== uploaded.storagePath) await deleteMoviePoster(organization.id, movieId, result.oldPath).catch(() => undefined);
    return { posterUrl: uploaded.url };
  } catch (error) {
    await deleteMoviePoster(organization.id, movieId, uploaded.storagePath).catch(() => undefined);
    throw error;
  }
}

export async function removeMoviePoster(movieIdInput: string) {
  const { actor, organization } = await getScheduleContext();
  requireMovieEditor(actor);
  const movieId = documentIdSchema.parse(movieIdInput);
  const existing = await getMoviePosterRecord(organization.id, movieId);
  if (!existing) throw new ServiceError("MOVIE_NOT_FOUND", 404, "Movie not found.");
  const result = await setMoviePosterRecord({ actorUid: actor.uid, organizationId: organization.id, movieId, poster: null });
  if (result.oldPath) await deleteMoviePoster(organization.id, movieId, result.oldPath).catch(() => undefined);
  return { removed: true };
}
