import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { removeMoviePoster, replaceMoviePoster } from "@/server/services/movie.service";

export const runtime = "nodejs";

async function PUTHandler(request: Request, context: RouteContext<"/api/admin/movies/[movieId]/poster">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const form = await request.formData();
    const poster = form.get("poster");
    if (!(poster instanceof File) || poster.size === 0) return invalidRequestBody();
    const { movieId } = await context.params;
    return apiSuccess(await replaceMoviePoster(movieId, poster));
  } catch (error) { return apiError(error); }
}

async function DELETEHandler(request: Request, context: RouteContext<"/api/admin/movies/[movieId]/poster">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try { const { movieId } = await context.params; return apiSuccess(await removeMoviePoster(movieId)); }
  catch (error) { return apiError(error); }
}

export const PUT = observedRoute("PUT.api.admin.movies.movieId.poster", PUTHandler);
export const DELETE = observedRoute("DELETE.api.admin.movies.movieId.poster", DELETEHandler);
