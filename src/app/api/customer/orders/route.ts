import { cookies } from "next/headers";

import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { placeCustomerOrder } from "@/server/services/order.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const result = await placeCustomerOrder((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, input);
    return apiSuccess({ ...result, destination: `/customer/payments/${result.order.publicOrderCode}` }, result.replayed ? 200 : 201);
  } catch (error) { return apiError(error); }
}
