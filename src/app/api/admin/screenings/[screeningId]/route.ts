import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getScreening, updateScreening } from "@/server/services/screening.service";

export const runtime = "nodejs";

async function GETHandler(_request: Request, context: RouteContext<"/api/admin/screenings/[screeningId]">) {
  try { const { screeningId } = await context.params; return apiSuccess(await getScreening(screeningId)); }
  catch (error) { return apiError(error); }
}

async function PATCHHandler(request: Request, context: RouteContext<"/api/admin/screenings/[screeningId]">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { const { screeningId } = await context.params; return apiSuccess({ screening: await updateScreening(screeningId, input) }); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.screenings.screeningId", GETHandler);
export const PATCH = observedRoute("PATCH.api.admin.screenings.screeningId", PATCHHandler);
