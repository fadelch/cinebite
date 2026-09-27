import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getMovie, updateMovie } from "@/server/services/movie.service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/admin/movies/[movieId]">) {
  try { const { movieId } = await context.params; return apiSuccess(await getMovie(movieId)); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/movies/[movieId]">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { const { movieId } = await context.params; return apiSuccess({ movie: await updateMovie(movieId, input) }); }
  catch (error) { return apiError(error); }
}
