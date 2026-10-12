import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { removeRecipeComponent, updateRecipeComponent } from "@/server/services/recipe.service";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, context: RouteContext<"/api/admin/menu/products/[productId]/recipe/[componentId]">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const { productId, componentId } = await context.params;
    return apiSuccess({ component: await updateRecipeComponent(productId, componentId, input) });
  } catch (error) { return apiError(error); }
}

async function DELETEHandler(request: Request, context: RouteContext<"/api/admin/menu/products/[productId]/recipe/[componentId]">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const { productId, componentId } = await context.params;
    return apiSuccess(await removeRecipeComponent(productId, componentId));
  } catch (error) { return apiError(error); }
}

export const PATCH = observedRoute("PATCH.api.admin.menu.products.productId.recipe.componentId", PATCHHandler);
export const DELETE = observedRoute("DELETE.api.admin.menu.products.productId.recipe.componentId", DELETEHandler);
