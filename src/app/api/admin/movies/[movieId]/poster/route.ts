import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { removeMoviePoster, replaceMoviePoster } from "@/server/services/movie.service";

export const runtime = "nodejs";

export async function PUT(request: Request, context: RouteContext<"/api/admin/movies/[movieId]/poster">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const form = await request.formData();
    const poster = form.get("poster");
    if (!(poster instanceof File) || poster.size === 0) return invalidRequestBody();
    const { movieId } = await context.params;
    return apiSuccess(await replaceMoviePoster(movieId, poster));
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/movies/[movieId]/poster">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try { const { movieId } = await context.params; return apiSuccess(await removeMoviePoster(movieId)); }
  catch (error) { return apiError(error); }
}
