import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin } from "@/server/http/api-response";
import { rotateSeatQr } from "@/server/services/seat-qr.service";

export const runtime = "nodejs";

async function POSTHandler(request: Request, context: { params: Promise<{ locationId: string; hallId: string; seatId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const { locationId, hallId, seatId } = await context.params;
    const qr = await rotateSeatQr(locationId, hallId, seatId);
    return apiSuccess({ status: qr.status, version: qr.version });
  } catch (error) { return apiError(error); }
}

export const POST = observedRoute("POST.api.admin.locations.locationId.halls.hallId.qr.seatId.rotate", POSTHandler);
