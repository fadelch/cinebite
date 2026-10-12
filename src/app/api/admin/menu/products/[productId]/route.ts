import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getProductForMenu, updateMenuProduct } from "@/server/services/menu.service";

export const runtime = "nodejs";

async function GETHandler(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  try { const { productId } = await params; return apiSuccess(await getProductForMenu(productId)); }
  catch (error) { return apiError(error); }
}

async function PATCHHandler(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { const { productId } = await params; return apiSuccess({ product: await updateMenuProduct(productId, input) }); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.menu.products.productId", GETHandler);
export const PATCH = observedRoute("PATCH.api.admin.menu.products.productId", PATCHHandler);
