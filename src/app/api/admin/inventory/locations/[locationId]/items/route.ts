import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { configureLocationInventory } from "@/server/services/inventory.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/admin/inventory/locations/[locationId]/items">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { const { locationId } = await context.params; return apiSuccess({ inventory: await configureLocationInventory(locationId, input) }, 201); }
  catch (error) { return apiError(error); }
}
