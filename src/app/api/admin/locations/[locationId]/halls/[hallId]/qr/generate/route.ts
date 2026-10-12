import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { generateMissingSeatQrs } from "@/server/services/seat-qr.service";
import { seatQrBulkSchema } from "@/validation/seat-qr";

export const runtime = "nodejs";

async function POSTHandler(request: Request, context: { params: Promise<{ locationId: string; hallId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    seatQrBulkSchema.parse(input);
    const { locationId, hallId } = await context.params;
    return apiSuccess(await generateMissingSeatQrs(locationId, hallId), 201);
  } catch (error) { return apiError(error); }
}

export const POST = observedRoute("POST.api.admin.locations.locationId.halls.hallId.qr.generate", POSTHandler);
