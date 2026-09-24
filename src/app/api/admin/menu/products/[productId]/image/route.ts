import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { removeMenuProductImage, replaceMenuProductImage } from "@/server/services/menu.service";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) return invalidRequestBody();
    const { productId } = await params;
    return apiSuccess(await replaceMenuProductImage(productId, image));
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try { const { productId } = await params; return apiSuccess(await removeMenuProductImage(productId)); }
  catch (error) { return apiError(error); }
}
