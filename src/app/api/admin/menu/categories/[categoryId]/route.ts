import { observedRoute } from "@/server/http/observed-route";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { updateMenuCategory } from "@/server/services/menu.service";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const { categoryId } = await params;
    return apiSuccess({ category: await updateMenuCategory(categoryId, input) });
  } catch (error) { return apiError(error); }
}

export const PATCH = observedRoute("PATCH.api.admin.menu.categories.categoryId", PATCHHandler);
