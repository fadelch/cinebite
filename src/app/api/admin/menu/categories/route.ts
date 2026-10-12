import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { createMenuCategory, getCategoriesForMenu } from "@/server/services/menu.service";

export const runtime = "nodejs";

async function GETHandler() {
  try { return apiSuccess({ categories: await getCategoriesForMenu() }); }
  catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess({ category: await createMenuCategory(input) }, 201); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.menu.categories", GETHandler);
export const POST = observedRoute("POST.api.admin.menu.categories", POSTHandler);
