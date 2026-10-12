import { observedRoute } from "@/server/http/observed-route";
import { cookies } from "next/headers";

import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { getCustomerCart, setCustomerCartItem } from "@/server/services/cart.service";

export const runtime = "nodejs";

async function token() {
  return (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
}

async function GETHandler() {
  try { return apiSuccess(await getCustomerCart(await token())); }
  catch (error) { return apiError(error); }
}

async function PUTHandler(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess(await setCustomerCartItem(await token(), input)); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.customer.cart", GETHandler);
export const PUT = observedRoute("PUT.api.customer.cart", PUTHandler);
