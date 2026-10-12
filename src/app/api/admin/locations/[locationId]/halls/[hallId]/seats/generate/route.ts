import { observedRoute } from "@/server/http/observed-route";
import { toSeatDto } from "@/lib/tenant-admin/dto";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { generateTenantSeats } from "@/server/services/tenant-structure.service";

export const runtime = "nodejs";

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ locationId: string; hallId: string }> },
) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequestBody();
  }
  try {
    const { locationId, hallId } = await context.params;
    const seats = await generateTenantSeats(locationId, hallId, input);
    return apiSuccess({ seats: seats.map(toSeatDto), count: seats.length }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export const POST = observedRoute("POST.api.admin.locations.locationId.halls.hallId.seats.generate", POSTHandler);
