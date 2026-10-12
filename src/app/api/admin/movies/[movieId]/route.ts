import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getMovie, updateMovie } from "@/server/services/movie.service";

export const runtime = "nodejs";

async function GETHandler(_request: Request, context: RouteContext<"/api/admin/movies/[movieId]">) {
  try { const { movieId } = await context.params; return apiSuccess(await getMovie(movieId)); }
  catch (error) { return apiError(error); }
}

async function PATCHHandler(request: Request, context: RouteContext<"/api/admin/movies/[movieId]">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { const { movieId } = await context.params; return apiSuccess({ movie: await updateMovie(movieId, input) }); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.movies.movieId", GETHandler);
export const PATCH = observedRoute("PATCH.api.admin.movies.movieId", PATCHHandler);
