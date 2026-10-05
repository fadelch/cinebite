import { cookies } from "next/headers";

import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getCustomerCart, setCustomerCartItem } from "@/server/services/cart.service";

export const runtime = "nodejs";

async function token() {
  return (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
}

export async function GET() {
  try { return apiSuccess(await getCustomerCart(await token())); }
  catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess(await setCustomerCartItem(await token(), input)); }
  catch (error) { return apiError(error); }
}
