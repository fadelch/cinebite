import { observedRoute } from "@/server/http/observed-route";
import { toHallDto } from "@/lib/tenant-admin/dto";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { changeTenantHallStatus } from "@/server/services/tenant-structure.service";

export const runtime = "nodejs";

async function PATCHHandler(
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
    const hall = await changeTenantHallStatus(locationId, hallId, input);
    return apiSuccess({ hall: toHallDto(hall) });
  } catch (error) {
    return apiError(error);
  }
}

export const PATCH = observedRoute("PATCH.api.admin.locations.locationId.halls.hallId.status", PATCHHandler);
