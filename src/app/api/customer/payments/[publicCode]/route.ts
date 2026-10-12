import { observedRoute } from "@/server/http/observed-route";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { customerPaymentStatus, retryCustomerPayment } from "@/server/services/payment.service";
export const runtime = "nodejs";
type Context = { params: Promise<{ publicCode: string }> };
async function GETHandler(_request: Request, context: Context) {
  try { return apiSuccess(await customerPaymentStatus((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, (await context.params).publicCode)); }
  catch (error) { return apiError(error); }
}
async function POSTHandler(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown; try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess(await retryCustomerPayment((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, (await context.params).publicCode, input)); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.customer.payments.publicCode", GETHandler);
export const POST = observedRoute("POST.api.customer.payments.publicCode", POSTHandler);
