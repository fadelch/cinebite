import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { removeRecipeComponent, updateRecipeComponent } from "@/server/services/recipe.service";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/menu/products/[productId]/recipe/[componentId]">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const { productId, componentId } = await context.params;
    return apiSuccess({ component: await updateRecipeComponent(productId, componentId, input) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/menu/products/[productId]/recipe/[componentId]">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const { productId, componentId } = await context.params;
    return apiSuccess(await removeRecipeComponent(productId, componentId));
  } catch (error) { return apiError(error); }
}
