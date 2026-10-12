import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { changeInventoryStock } from "@/server/services/stock.service";

export const runtime = "nodejs";

async function POSTHandler(request: Request, context: RouteContext<"/api/admin/inventory/locations/[locationId]/items/[locationInventoryId]/movements">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const { locationId, locationInventoryId } = await context.params;
    return apiSuccess(await changeInventoryStock(locationId, locationInventoryId, input), 201);
  } catch (error) { return apiError(error); }
}

export const POST = observedRoute("POST.api.admin.inventory.locations.locationId.items.locationInventoryId.movements", POSTHandler);
