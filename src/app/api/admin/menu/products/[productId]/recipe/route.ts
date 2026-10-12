import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { addRecipeComponent, getRecipeWorkspace } from "@/server/services/recipe.service";

export const runtime = "nodejs";

async function GETHandler(_request: Request, context: RouteContext<"/api/admin/menu/products/[productId]/recipe">) {
  try { const { productId } = await context.params; return apiSuccess(await getRecipeWorkspace(productId)); }
  catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request, context: RouteContext<"/api/admin/menu/products/[productId]/recipe">) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { const { productId } = await context.params; return apiSuccess({ component: await addRecipeComponent(productId, input) }, 201); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.menu.products.productId.recipe", GETHandler);
export const POST = observedRoute("POST.api.admin.menu.products.productId.recipe", POSTHandler);
