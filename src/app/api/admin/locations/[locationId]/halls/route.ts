import { observedRoute } from "@/server/http/observed-route";
import { toHallDto } from "@/lib/tenant-admin/dto";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { createHallForTenant } from "@/server/services/tenant-structure.service";

export const runtime = "nodejs";

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequestBody();
  }
  try {
    const { locationId } = await context.params;
    const hall = await createHallForTenant(locationId, input);
    return apiSuccess({ hall: toHallDto(hall) }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export const POST = observedRoute("POST.api.admin.locations.locationId.halls", POSTHandler);
