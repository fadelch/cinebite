import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getDeliveryOrder, transitionDeliveryOrder } from "@/server/services/delivery.service";
export const runtime = "nodejs";
type Context = { params: Promise<{ publicCode: string }> };
export async function GET(_request: Request, context: Context) {
  try { return apiSuccess(await getDeliveryOrder((await context.params).publicCode)); } catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess(await transitionDeliveryOrder((await context.params).publicCode, input)); } catch (error) { return apiError(error); }
}
