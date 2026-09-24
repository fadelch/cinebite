import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { updateMenuProductLocation } from "@/server/services/menu.service";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ productId: string; locationId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const { productId, locationId } = await params;
    return apiSuccess({ location: await updateMenuProductLocation(productId, locationId, input) });
  } catch (error) { return apiError(error); }
}
