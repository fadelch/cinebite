import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { createMovie, getMovies } from "@/server/services/movie.service";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  try { return apiSuccess(await getMovies(Object.fromEntries(new URL(request.url).searchParams.entries()))); }
  catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const form = await request.formData();
    const raw = form.get("payload");
    if (typeof raw !== "string") return invalidRequestBody();
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return invalidRequestBody(); }
    const poster = form.get("poster");
    return apiSuccess({ movie: await createMovie(input, poster instanceof File ? poster : null) }, 201);
  } catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.movies", GETHandler);
export const POST = observedRoute("POST.api.admin.movies", POSTHandler);
