import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { updateInventoryThreshold } from "@/server/services/inventory.service";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/inventory/locations/[locationId]/items/[locationInventoryId]/threshold">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const { locationId, locationInventoryId } = await context.params;
    return apiSuccess({ inventory: await updateInventoryThreshold(locationId, locationInventoryId, input) });
  } catch (error) { return apiError(error); }
}
