import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin } from "@/server/http/api-response";
import { cancelScreening } from "@/server/services/screening.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/admin/screenings/[screeningId]/cancel">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try { const { screeningId } = await context.params; return apiSuccess({ screening: await cancelScreening(screeningId) }); }
  catch (error) { return apiError(error); }
}
