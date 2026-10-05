import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { simulateCustomerPayment } from "@/server/services/payment.service";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ publicCode: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown; try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess(await simulateCustomerPayment((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, (await context.params).publicCode, input)); }
  catch (error) { return apiError(error); }
}
