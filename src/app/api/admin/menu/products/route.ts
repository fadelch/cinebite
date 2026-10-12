import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { createMenuProduct, getProductsForMenu } from "@/server/services/menu.service";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    return apiSuccess(await getProductsForMenu(query));
  } catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const form = await request.formData();
    const raw = form.get("payload");
    if (typeof raw !== "string") return invalidRequestBody();
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return invalidRequestBody(); }
    const image = form.get("image");
    return apiSuccess({ product: await createMenuProduct(input, image instanceof File ? image : null) }, 201);
  } catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.menu.products", GETHandler);
export const POST = observedRoute("POST.api.admin.menu.products", POSTHandler);
