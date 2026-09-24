import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getProductForMenu, updateMenuProduct } from "@/server/services/menu.service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  try { const { productId } = await params; return apiSuccess(await getProductForMenu(productId)); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { const { productId } = await params; return apiSuccess({ product: await updateMenuProduct(productId, input) }); }
  catch (error) { return apiError(error); }
}
