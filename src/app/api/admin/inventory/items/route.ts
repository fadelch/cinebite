import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { createInventoryItem, getInventoryItems } from "@/server/services/inventory.service";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  try { return apiSuccess(await getInventoryItems(Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess({ item: await createInventoryItem(input) }, 201); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.inventory.items", GETHandler);
export const POST = observedRoute("POST.api.admin.inventory.items", POSTHandler);
