import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin } from "@/server/http/api-response";
import { regenerateSeatQr } from "@/server/services/seat-qr.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ locationId: string; hallId: string; seatId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const { locationId, hallId, seatId } = await context.params;
    const qr = await regenerateSeatQr(locationId, hallId, seatId);
    return apiSuccess({ status: qr.status, version: qr.version });
  } catch (error) { return apiError(error); }
}
