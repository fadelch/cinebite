import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getKitchenOrder, transitionKitchenOrder } from "@/server/services/kitchen.service";

export const runtime = "nodejs";
type Context = { params: Promise<{ publicCode: string }> };

export async function GET(_request: Request, context: Context) {
  try { return apiSuccess(await getKitchenOrder((await context.params).publicCode)); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess(await transitionKitchenOrder((await context.params).publicCode, input)); }
  catch (error) { return apiError(error); }
}
