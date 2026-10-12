import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getKitchenOrder, transitionKitchenOrder } from "@/server/services/kitchen.service";

export const runtime = "nodejs";
type Context = { params: Promise<{ publicCode: string }> };

async function GETHandler(_request: Request, context: Context) {
  try { return apiSuccess(await getKitchenOrder((await context.params).publicCode)); }
  catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess(await transitionKitchenOrder((await context.params).publicCode, input)); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.kitchen.orders.publicCode", GETHandler);
export const POST = observedRoute("POST.api.kitchen.orders.publicCode", POSTHandler);
