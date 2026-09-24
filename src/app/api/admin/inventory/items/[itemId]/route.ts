import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { updateInventoryItem } from "@/server/services/inventory.service";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/inventory/items/[itemId]">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { const { itemId } = await context.params; return apiSuccess({ item: await updateInventoryItem(itemId, input) }); }
  catch (error) { return apiError(error); }
}
